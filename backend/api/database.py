"""Database viewer API endpoints."""

from fastapi import APIRouter, HTTPException, Query, Depends
from typing import Optional

from backend.db.connection import get_pool
from backend.db.repositories import DomainRepository, EmailRepository, SocialLinkRepository, ContactRepository
from backend.middleware.auth import get_current_user, get_client_id

router = APIRouter(prefix="/api", tags=["database"])


@router.get("/results")
async def get_results(
    status: Optional[str] = None,
    platform: Optional[str] = None,
    method: Optional[str] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=500),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    client_id = get_client_id(current_user)
    pool = await get_pool()
    async with pool.acquire() as conn:
        domain_repo = DomainRepository(conn)
        rows, total = await domain_repo.get_filtered(
            client_id=client_id, status=status, platform=platform,
            method=method, search=search, page=page, limit=limit,
            start_date=start_date, end_date=end_date,
        )
        email_repo = EmailRepository(conn)
        social_repo = SocialLinkRepository(conn)
        contact_repo = ContactRepository(conn)
        for row in rows:
            row["emails"] = await email_repo.get_by_domain_id(row["id"])
            row["social_links"] = await social_repo.get_by_domain_id(row["id"])
            row["contacts"] = await contact_repo.get_by_domain_id(row["id"])

    return {
        "success": True,
        "data": rows,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": (total + limit - 1) // limit,
    }


@router.get("/results/stats")
async def get_results_stats(current_user: dict = Depends(get_current_user)):
    client_id = get_client_id(current_user)
    pool = await get_pool()
    async with pool.acquire() as conn:
        stats = await DomainRepository(conn).get_stats(client_id)
    return {"success": True, "data": stats}


@router.delete("/results/{domain_id}")
async def delete_result(domain_id: int, current_user: dict = Depends(get_current_user)):
    client_id = get_client_id(current_user)
    pool = await get_pool()
    async with pool.acquire() as conn:
        await DomainRepository(conn).delete_by_id(domain_id, client_id)
    return {"success": True, "message": "Deleted"}


@router.delete("/results")
async def delete_all_results(current_user: dict = Depends(get_current_user)):
    client_id = get_client_id(current_user)
    pool = await get_pool()
    async with pool.acquire() as conn:
        count = await DomainRepository(conn).delete_all(client_id)
    return {"success": True, "message": f"Deleted {count} records"}


@router.get("/emails")
async def get_emails(
    tier: Optional[int] = None,
    classification: Optional[str] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=500),
    current_user: dict = Depends(get_current_user),
):
    client_id = get_client_id(current_user)
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows, total = await EmailRepository(conn).get_all_with_domain(
            client_id=client_id, tier=tier, classification=classification,
            search=search, page=page, limit=limit,
        )
    return {
        "success": True,
        "data": rows,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": (total + limit - 1) // limit,
    }


@router.get("/emails/stats")
async def get_email_stats(current_user: dict = Depends(get_current_user)):
    client_id = get_client_id(current_user)
    pool = await get_pool()
    async with pool.acquire() as conn:
        stats = await EmailRepository(conn).get_stats(client_id)
    return {"success": True, "data": stats}


@router.delete("/emails/{email_id}")
async def delete_email(email_id: int, current_user: dict = Depends(get_current_user)):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await EmailRepository(conn).delete_by_id(email_id)
    return {"success": True, "message": "Deleted"}
