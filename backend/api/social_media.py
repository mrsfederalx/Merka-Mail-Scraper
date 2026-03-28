"""Social media finder API endpoints."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional

from backend.db.connection import get_pool
from backend.db.repositories import DomainRepository, SocialLinkRepository
from backend.middleware.auth import get_current_user, get_client_id
from backend.modules.social_media_finder import search_social_profiles

router = APIRouter(prefix="/api/social", tags=["social-media"])


class SearchSocialRequest(BaseModel):
    company: str
    domain: Optional[str] = None
    platforms: Optional[list[str]] = None


@router.get("/{domain}")
async def get_social_links(domain: str, current_user: dict = Depends(get_current_user)):
    client_id = get_client_id(current_user)
    pool = await get_pool()
    async with pool.acquire() as conn:
        domain_record = await DomainRepository(conn).get_by_domain(client_id, domain)
        if not domain_record:
            return {"success": True, "data": []}
        links = await SocialLinkRepository(conn).get_by_domain_id(domain_record["id"])
    return {"success": True, "data": links}


@router.post("/search")
async def search_social(req: SearchSocialRequest, current_user: dict = Depends(get_current_user)):
    client_id = get_client_id(current_user)
    results = await search_social_profiles(company=req.company, domain=req.domain, platforms=req.platforms, client=str(client_id))
    if req.domain and results:
        pool = await get_pool()
        async with pool.acquire() as conn:
            domain_record = await DomainRepository(conn).get_by_domain(client_id, req.domain)
            if domain_record:
                social_repo = SocialLinkRepository(conn)
                for r in results:
                    await social_repo.insert(domain_id=domain_record["id"], platform=r["platform"], url=r["url"], source=r.get("source", "dork"))
    return {"success": True, "data": results}


@router.get("")
async def get_all_social(
    page: int = 1,
    limit: int = 50,
    current_user: dict = Depends(get_current_user),
):
    client_id = get_client_id(current_user)
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows, total = await SocialLinkRepository(conn).get_all_grouped(client_id=client_id, page=page, limit=limit)
    return {"success": True, "data": rows, "total": total}
