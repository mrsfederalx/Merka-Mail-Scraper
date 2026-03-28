"""JWT authentication dependency."""

from datetime import datetime, timezone
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt

from backend.config import get_settings
from backend.db.connection import get_pool
from backend.db.repositories import UserRepository, RefreshTokenRepository
from backend.utils.logger import get_logger

log = get_logger("auth")
bearer_scheme = HTTPBearer(auto_error=False)


def create_access_token(payload: dict) -> str:
    """Create a signed JWT access token."""
    from datetime import timedelta
    settings = get_settings()
    data = payload.copy()
    data["exp"] = datetime.now(timezone.utc) + timedelta(
        minutes=settings.jwt_access_expires_minutes
    )
    data["iat"] = datetime.now(timezone.utc)
    return jwt.encode(data, settings.jwt_access_secret, algorithm="HS256")


def create_refresh_token_value() -> str:
    """Generate a cryptographically random refresh token string."""
    import secrets
    return secrets.token_urlsafe(64)


def hash_token(token: str) -> str:
    """SHA-256 hash a token for storage."""
    import hashlib
    return hashlib.sha256(token.encode()).hexdigest()


def decode_access_token(token: str) -> dict:
    """Decode and verify an access token. Raises JWTError on failure."""
    settings = get_settings()
    return jwt.decode(token, settings.jwt_access_secret, algorithms=["HS256"])


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> dict:
    """FastAPI dependency — validates JWT and returns user payload."""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = decode_access_token(credentials.credentials)
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        return payload
    except JWTError as e:
        log.error(f"JWT decode failed: {type(e).__name__}: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token is invalid or expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception as e:
        log.error(f"JWT unexpected error: {type(e).__name__}: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token is invalid or expired",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
    """Dependency — requires admin role."""
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required",
        )
    return current_user


def get_client_id(current_user: dict) -> int:
    """Extract client_id from JWT payload."""
    client_id = current_user.get("client_id")
    if client_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No client assigned to this user",
        )
    return int(client_id)
