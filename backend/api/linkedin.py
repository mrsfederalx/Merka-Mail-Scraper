"""LinkedIn dorker API endpoints."""

import traceback
from fastapi import APIRouter, Query, Depends
from pydantic import BaseModel
from typing import Optional

from backend.db.connection import get_pool
from backend.db.repositories import DomainRepository, ContactRepository, EmailRepository
from backend.middleware.auth import get_current_user, get_client_id
from backend.modules.linkedin_dorker import search_decision_makers, search_company_page, discover_decision_makers
from backend.utils.logger import get_logger

log = get_logger("linkedin_api")
router = APIRouter(prefix="/api/linkedin", tags=["linkedin"])


class SearchRequest(BaseModel):
    company: str
    domain: Optional[str] = None
    roles: Optional[list[str]] = None
    max_results: int = 20


class DiscoverRequest(BaseModel):
    domain: str
    company_name: Optional[str] = None
    roles: Optional[list[str]] = None
    max_results: int = 20


class BulkDiscoverRequest(BaseModel):
    domains: list[str]
    roles: Optional[list[str]] = None
    max_results: int = 20


async def _save_contacts_to_db(pool, client_id: int, domain: str, contacts: list[dict]) -> int:
    if not contacts:
        return 0
    async with pool.acquire() as conn:
        domain_repo = DomainRepository(conn)
        await domain_repo.upsert(client_id, domain, status="completed")
        domain_record = await domain_repo.get_by_domain(client_id, domain)
        if not domain_record:
            return 0
        domain_id = domain_record["id"]
        contact_repo = ContactRepository(conn)
        email_repo = EmailRepository(conn)
        saved = 0
        for c in contacts:
            if c.get("score", 0) < 20:
                continue
            try:
                contact_id = await contact_repo.insert(
                    domain_id=domain_id, full_name=c.get("full_name"),
                    first_name=c.get("first_name"), last_name=c.get("last_name"),
                    role=c.get("role"), linkedin_url=c.get("linkedin_url"),
                    source=c.get("source"), search_query=c.get("search_query"),
                    score=c.get("score", 0),
                )
                if c.get("email_found") and contact_id:
                    await contact_repo.update_email_found(contact_id, c["email_found"], c.get("email_verified", False))
                    await email_repo.insert(domain_id=domain_id, email=c["email_found"], source="linkedin_discovery")
                saved += 1
            except Exception as e:
                log.debug(f"Error saving contact: {e}")
    return saved


@router.post("/search")
async def search(req: SearchRequest, current_user: dict = Depends(get_current_user)):
    from backend.config import get_app_settings
    client_id = get_client_id(current_user)
    app_settings = get_app_settings()
    try:
        contacts = await search_decision_makers(
            company=req.company, domain=req.domain, roles=req.roles,
            max_results=req.max_results, rate_limit_seconds=app_settings.linkedin_dorking.rate_limit_seconds,
            client=str(client_id),
        )
    except Exception as e:
        return {"success": False, "error": str(e)[:200], "data": []}
    for c in contacts:
        c.setdefault("email_found", None)
        c.setdefault("email_verified", False)
    if req.domain and contacts:
        pool = await get_pool()
        saved = await _save_contacts_to_db(pool, client_id, req.domain, contacts)
        log.info(f"Saved {saved} contacts for {req.domain}")
    return {"success": True, "data": contacts, "total": len(contacts)}


@router.post("/discover")
async def discover(req: DiscoverRequest, current_user: dict = Depends(get_current_user)):
    from backend.config import get_app_settings
    client_id = get_client_id(current_user)
    app_settings = get_app_settings()
    try:
        result = await discover_decision_makers(
            domain=req.domain, company_name=req.company_name, roles=req.roles,
            max_results=req.max_results, rate_limit_seconds=app_settings.linkedin_dorking.rate_limit_seconds,
            smtp_timeout=app_settings.email_discovery.smtp_timeout_seconds, client=str(client_id),
        )
    except Exception as e:
        log.error(f"Discover failed for {req.domain}: {e}\n{traceback.format_exc()}")
        return {"success": False, "error": str(e)[:200], "data": {"contacts": [], "emails_found": 0, "emails_verified": 0}}
    pool = await get_pool()
    saved = await _save_contacts_to_db(pool, client_id, req.domain, result["contacts"])
    return {"success": True, "data": {"contacts": result["contacts"], "emails_found": result["emails_found"], "emails_verified": result["emails_verified"], "saved_to_db": saved}}


@router.get("/contacts")
async def get_all_contacts(
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=500),
    current_user: dict = Depends(get_current_user),
):
    client_id = get_client_id(current_user)
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows, total = await ContactRepository(conn).get_all_with_domain_name(client_id=client_id, search=search, page=page, limit=limit)
    return {"success": True, "data": rows, "total": total, "page": page, "limit": limit, "total_pages": (total + limit - 1) // limit}
