"""Email discovery API endpoints."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional

from backend.db.connection import get_pool
from backend.db.repositories import DomainRepository, ContactRepository
from backend.middleware.auth import get_current_user, get_client_id
from backend.modules.email_discoverer import check_mx_records, generate_email_patterns, verify_smtp, discover_emails

router = APIRouter(prefix="/api/email-discovery", tags=["email-discovery"])


class MXCheckRequest(BaseModel):
    domain: str


class GeneratePatternsRequest(BaseModel):
    first_name: str
    last_name: str
    domain: str


class VerifyEmailsRequest(BaseModel):
    emails: list[str]
    timeout: int = 10


class DiscoverRequest(BaseModel):
    domain: str
    contacts: Optional[list[dict]] = None


@router.post("/mx-check")
async def mx_check(req: MXCheckRequest, current_user: dict = Depends(get_current_user)):
    mx_servers = await check_mx_records(req.domain)
    return {"success": True, "data": {"domain": req.domain, "mx_servers": mx_servers}}


@router.post("/generate-patterns")
async def gen_patterns(req: GeneratePatternsRequest, current_user: dict = Depends(get_current_user)):
    patterns = generate_email_patterns(req.first_name, req.last_name, req.domain)
    return {"success": True, "data": {"patterns": patterns}}


@router.post("/verify")
async def verify_emails(req: VerifyEmailsRequest, current_user: dict = Depends(get_current_user)):
    results = [await verify_smtp(email, timeout=req.timeout) for email in req.emails]
    return {"success": True, "data": results}


@router.post("/discover")
async def discover(req: DiscoverRequest, current_user: dict = Depends(get_current_user)):
    from backend.config import get_app_settings
    client_id = get_client_id(current_user)
    app_settings = get_app_settings()
    contacts = req.contacts or []

    if not contacts:
        pool = await get_pool()
        async with pool.acquire() as conn:
            domain_record = await DomainRepository(conn).get_by_domain(client_id, req.domain)
            if domain_record:
                contacts = await ContactRepository(conn).get_by_domain_id(domain_record["id"])

    results = await discover_emails(
        domain=req.domain,
        contacts=contacts,
        timeout=app_settings.email_discovery.smtp_timeout_seconds,
        client=str(client_id),
    )
    return {"success": True, "data": results}
