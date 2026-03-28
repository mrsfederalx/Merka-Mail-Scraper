"""Blacklist management API endpoints."""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from backend.db.connection import get_pool
from backend.db.repositories import BlacklistRepository
from backend.middleware.auth import get_current_user, get_client_id

router = APIRouter(prefix="/api/blacklist", tags=["blacklist"])


class UpdateBlacklistRequest(BaseModel):
    patterns: list[str]


class AddPatternRequest(BaseModel):
    pattern: str


@router.get("/{list_type}")
async def get_blacklist(list_type: str, current_user: dict = Depends(get_current_user)):
    client_id = get_client_id(current_user)
    pool = await get_pool()
    async with pool.acquire() as conn:
        repo = BlacklistRepository(conn)
        if list_type == "emails":
            data = await repo.get_email_patterns(client_id)
        elif list_type == "domains":
            data = await repo.get_blocked_domains(client_id)
        else:
            raise HTTPException(status_code=400, detail="Invalid type. Use 'emails' or 'domains'")
    return {"success": True, "data": data}


@router.post("/{list_type}")
async def update_blacklist(
    list_type: str,
    req: UpdateBlacklistRequest,
    current_user: dict = Depends(get_current_user),
):
    client_id = get_client_id(current_user)
    pool = await get_pool()
    async with pool.acquire() as conn:
        repo = BlacklistRepository(conn)
        if list_type == "emails":
            await repo.set_email_patterns(client_id, req.patterns)
        elif list_type == "domains":
            await repo.set_blocked_domains(client_id, req.patterns)
        else:
            raise HTTPException(status_code=400, detail="Invalid type")
    return {"success": True, "message": f"Updated {len(req.patterns)} entries"}


@router.post("/{list_type}/add")
async def add_to_blacklist(
    list_type: str,
    req: AddPatternRequest,
    current_user: dict = Depends(get_current_user),
):
    client_id = get_client_id(current_user)
    pool = await get_pool()
    async with pool.acquire() as conn:
        repo = BlacklistRepository(conn)
        if list_type == "emails":
            await repo.add_email_pattern(client_id, req.pattern)
        elif list_type == "domains":
            await repo.add_blocked_domain(client_id, req.pattern)
        else:
            raise HTTPException(status_code=400, detail="Invalid type")
    return {"success": True, "message": f"Added '{req.pattern}'"}


@router.delete("/{list_type}/{pattern}")
async def remove_from_blacklist(
    list_type: str,
    pattern: str,
    current_user: dict = Depends(get_current_user),
):
    client_id = get_client_id(current_user)
    pool = await get_pool()
    async with pool.acquire() as conn:
        repo = BlacklistRepository(conn)
        if list_type == "emails":
            await repo.remove_email_pattern(client_id, pattern)
        elif list_type == "domains":
            await repo.remove_blocked_domain(client_id, pattern)
        else:
            raise HTTPException(status_code=400, detail="Invalid type")
    return {"success": True, "message": f"Removed '{pattern}'"}
