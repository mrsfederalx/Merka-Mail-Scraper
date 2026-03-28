"""JWT auth endpoints: login, logout, refresh, me, users management."""

import re
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Request, status
from pydantic import BaseModel, EmailStr
from passlib.context import CryptContext

from backend.config import get_settings
from backend.db.connection import get_pool
from backend.db.repositories import UserRepository, RefreshTokenRepository
from backend.middleware.auth import (
    create_access_token,
    create_refresh_token_value,
    hash_token,
    get_current_user,
    require_admin,
    get_client_id,
)
from backend.middleware.security import limiter

router = APIRouter(prefix="/api/auth", tags=["auth"])
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)

PASSWORD_RE = re.compile(r'^(?=.*[A-Z])(?=.*\d).{8,}$')
MAX_FAILED = 5
LOCK_MINUTES = 15


# ── Schemas ──────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    refresh_token: str


class RefreshRequest(BaseModel):
    refresh_token: str


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str


class CreateUserRequest(BaseModel):
    email: str
    password: str
    name: str
    role: str = "user"
    client_id: Optional[int] = None


class UpdateUserRequest(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    client_id: Optional[int] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None


# ── Helpers ──────────────────────────────────────────────────────────────────

def _validate_password(password: str) -> None:
    if not PASSWORD_RE.match(password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Şifre en az 8 karakter, 1 büyük harf ve 1 rakam içermelidir",
        )


def _build_token_pair(user: dict) -> tuple[str, str]:
    """Create access + refresh token for a user."""
    access_payload = {
        "sub": str(user["id"]),
        "email": user["email"],
        "role": user["role"],
        "client_id": user["client_id"],
    }
    access_token = create_access_token(access_payload)
    refresh_token_value = create_refresh_token_value()
    return access_token, refresh_token_value


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
async def login(request: Request, body: LoginRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        user_repo = UserRepository(conn)
        token_repo = RefreshTokenRepository(conn)

        user = await user_repo.get_by_email(body.email.lower().strip())
        if not user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

        if not user["is_active"]:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")

        # Check lockout
        if user["locked_until"] and user["locked_until"] > datetime.now(timezone.utc).replace(tzinfo=None):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Account locked. Try again after {user['locked_until'].strftime('%H:%M:%S')}",
            )

        if not pwd_context.verify(body.password, user["password_hash"]):
            failed = await user_repo.increment_failed_attempts(user["id"])
            if failed >= MAX_FAILED:
                locked_until = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=LOCK_MINUTES)
                await user_repo.set_locked_until(user["id"], locked_until)
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Account locked for {LOCK_MINUTES} minutes due to too many failed attempts",
                )
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

        # Success
        await user_repo.reset_failed_attempts(user["id"])

        access_token, refresh_value = _build_token_pair(user)
        token_hash = hash_token(refresh_value)
        settings = get_settings()
        expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=settings.jwt_refresh_days)
        await token_repo.create(user["id"], token_hash, expires_at)

        return TokenResponse(access_token=access_token, refresh_token=refresh_value)


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit("10/minute")
async def refresh_token(request: Request, body: RefreshRequest):
    pool = await get_pool()
    async with pool.acquire() as conn:
        token_repo = RefreshTokenRepository(conn)
        user_repo = UserRepository(conn)

        token_hash = hash_token(body.refresh_token)
        stored = await token_repo.get_by_hash(token_hash)

        if not stored or stored["revoked"]:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

        if stored["expires_at"] < datetime.now(timezone.utc).replace(tzinfo=None):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token expired")

        user = await user_repo.get_by_id(stored["user_id"])
        if not user or not user["is_active"]:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or disabled")

        # Token rotation
        await token_repo.revoke(token_hash)
        access_token, new_refresh_value = _build_token_pair(user)
        new_hash = hash_token(new_refresh_value)
        settings = get_settings()
        expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=settings.jwt_refresh_days)
        await token_repo.create(user["id"], new_hash, expires_at)

        return TokenResponse(access_token=access_token, refresh_token=new_refresh_value)


@router.post("/logout")
async def logout(
    body: RefreshRequest,
    current_user: dict = Depends(get_current_user),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        token_repo = RefreshTokenRepository(conn)
        token_hash = hash_token(body.refresh_token)
        await token_repo.revoke(token_hash)
    return {"message": "Logged out successfully"}


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        user_repo = UserRepository(conn)
        user = await user_repo.get_by_id(int(current_user["sub"]))
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        return {
            "id": user["id"],
            "email": user["email"],
            "name": user["name"],
            "role": user["role"],
            "client_id": user["client_id"],
            "last_login": user["last_login"],
        }


@router.put("/password")
async def change_password(
    body: PasswordChangeRequest,
    current_user: dict = Depends(get_current_user),
):
    _validate_password(body.new_password)
    pool = await get_pool()
    async with pool.acquire() as conn:
        user_repo = UserRepository(conn)
        user = await user_repo.get_by_id(int(current_user["sub"]))
        if not user or not pwd_context.verify(body.current_password, user["password_hash"]):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password incorrect")
        new_hash = pwd_context.hash(body.new_password)
        await user_repo.update(user["id"], password_hash=new_hash)
    return {"message": "Password changed successfully"}


# ── Admin: User Management ────────────────────────────────────────────────────

@router.get("/users")
async def list_users(current_user: dict = Depends(require_admin)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        user_repo = UserRepository(conn)
        users = await user_repo.get_all()
    return {"success": True, "data": users}


@router.post("/users", status_code=status.HTTP_201_CREATED)
async def create_user(
    body: CreateUserRequest,
    current_user: dict = Depends(require_admin),
):
    _validate_password(body.password)
    if body.role not in ("admin", "user"):
        raise HTTPException(status_code=400, detail="Role must be 'admin' or 'user'")

    pool = await get_pool()
    async with pool.acquire() as conn:
        user_repo = UserRepository(conn)
        existing = await user_repo.get_by_email(body.email.lower().strip())
        if existing:
            raise HTTPException(status_code=409, detail="Email already registered")
        password_hash = pwd_context.hash(body.password)
        user_id = await user_repo.create(
            email=body.email.lower().strip(),
            password_hash=password_hash,
            name=body.name,
            role=body.role,
            client_id=body.client_id,
        )
    return {"success": True, "id": user_id, "message": "User created"}


@router.put("/users/{user_id}")
async def update_user(
    user_id: int,
    body: UpdateUserRequest,
    current_user: dict = Depends(require_admin),
):
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    if "role" in updates and updates["role"] not in ("admin", "user"):
        raise HTTPException(status_code=400, detail="Role must be 'admin' or 'user'")

    # Hash password if provided
    if "password" in updates:
        _validate_password(updates["password"])
        updates["password_hash"] = pwd_context.hash(updates.pop("password"))

    pool = await get_pool()
    async with pool.acquire() as conn:
        user_repo = UserRepository(conn)
        ok = await user_repo.update(user_id, **updates)
        if not ok:
            raise HTTPException(status_code=404, detail="User not found")
    return {"success": True, "message": "User updated"}


@router.post("/users/{user_id}/reset-data")
async def reset_user_data(
    user_id: int,
    current_user: dict = Depends(require_admin),
):
    """Admin resets all scraped data for a user's client (domains, emails, contacts, social links, jobs)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        user_repo = UserRepository(conn)
        target = await user_repo.get_by_id(user_id)
        if not target:
            raise HTTPException(status_code=404, detail="User not found")
        if not target["client_id"]:
            raise HTTPException(status_code=400, detail="Bu kullanıcıya atanmış client yok")

        client_id = target["client_id"]
        domain_count = await conn.fetchval(
            "SELECT COUNT(*) FROM domains WHERE client_id=$1", client_id
        )
        # CASCADE: emails, contacts, social_links, whois_data otomatik silinir
        await conn.execute("DELETE FROM domains WHERE client_id=$1", client_id)
        await conn.execute("DELETE FROM processing_jobs WHERE client_id=$1", client_id)

    return {
        "success": True,
        "message": f"Sıfırlama tamamlandı. {domain_count} domain ve ilişkili tüm veriler silindi.",
        "deleted_domains": int(domain_count),
    }


@router.post("/impersonate/{user_id}", response_model=TokenResponse)
async def impersonate_user(
    user_id: int,
    current_user: dict = Depends(require_admin),
):
    """Admin generates a token pair to log in as another user."""
    if user_id == int(current_user["sub"]):
        raise HTTPException(status_code=400, detail="Cannot impersonate yourself")
    pool = await get_pool()
    async with pool.acquire() as conn:
        user_repo = UserRepository(conn)
        token_repo = RefreshTokenRepository(conn)
        target = await user_repo.get_by_id(user_id)
        if not target:
            raise HTTPException(status_code=404, detail="User not found")
        if not target["is_active"]:
            raise HTTPException(status_code=403, detail="User account is disabled")
        access_token, refresh_value = _build_token_pair(target)
        token_hash = hash_token(refresh_value)
        settings = get_settings()
        expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=settings.jwt_refresh_days)
        await token_repo.create(target["id"], token_hash, expires_at)
    return TokenResponse(access_token=access_token, refresh_token=refresh_value)


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    current_user: dict = Depends(require_admin),
):
    if user_id == int(current_user["sub"]):
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    pool = await get_pool()
    async with pool.acquire() as conn:
        user_repo = UserRepository(conn)
        ok = await user_repo.delete(user_id)
        if not ok:
            raise HTTPException(status_code=404, detail="User not found")
    return {"success": True, "message": "User deleted"}
