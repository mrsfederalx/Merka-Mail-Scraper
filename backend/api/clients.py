"""Client management API endpoints."""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional

from backend.db.connection import get_pool
from backend.db.repositories import ClientRepository, UserRepository
from backend.middleware.auth import get_current_user, require_admin

router = APIRouter(prefix="/api/clients", tags=["clients"])


class CreateClientRequest(BaseModel):
    name: str
    slug: str


class UpdateClientRequest(BaseModel):
    name: str


@router.get("")
async def list_clients(current_user: dict = Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        repo = ClientRepository(conn)
        clients = await repo.get_all()
    return {"success": True, "data": clients}


@router.post("", status_code=201)
async def create_client(req: CreateClientRequest, current_user: dict = Depends(require_admin)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        repo = ClientRepository(conn)
        existing = await repo.get_by_slug(req.slug)
        if existing:
            raise HTTPException(status_code=409, detail=f"Client slug '{req.slug}' already exists")
        client_id = await repo.create(req.name, req.slug)
    return {"success": True, "data": {"id": client_id, "name": req.name, "slug": req.slug}}


@router.put("/{client_id}")
async def update_client(client_id: int, req: UpdateClientRequest, current_user: dict = Depends(require_admin)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        repo = ClientRepository(conn)
        ok = await repo.update(client_id, req.name)
        if not ok:
            raise HTTPException(status_code=404, detail="Client not found")
    return {"success": True, "message": "Updated"}


@router.delete("/{client_id}")
async def delete_client(client_id: int, current_user: dict = Depends(require_admin)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        repo = ClientRepository(conn)
        ok = await repo.delete(client_id)
        if not ok:
            raise HTTPException(status_code=404, detail="Client not found")
    return {"success": True, "message": "Deleted"}


@router.post("/{client_id}/switch")
async def switch_client(client_id: int, current_user: dict = Depends(get_current_user)):
    """Switch active client for the current user."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        client_repo = ClientRepository(conn)
        client = await client_repo.get_by_id(client_id)
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")
        user_repo = UserRepository(conn)
        await user_repo.update(int(current_user["sub"]), client_id=client_id)
    return {"success": True, "data": {"client_id": client_id}}
