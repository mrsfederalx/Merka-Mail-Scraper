"""WHOIS and phone API endpoints."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from backend.db.connection import get_pool
from backend.db.repositories import DomainRepository, WhoisRepository
from backend.middleware.auth import get_current_user, get_client_id
from backend.modules.whois_phone import lookup_whois, analyze_phone_number

router = APIRouter(prefix="/api/whois", tags=["whois-phone"])


class WhoisLookupRequest(BaseModel):
    domain: str


class PhoneAnalyzeRequest(BaseModel):
    number: str
    region: str = "TR"


@router.get("/{domain}")
async def get_whois(domain: str, current_user: dict = Depends(get_current_user)):
    client_id = get_client_id(current_user)
    pool = await get_pool()
    async with pool.acquire() as conn:
        domain_record = await DomainRepository(conn).get_by_domain(client_id, domain)
        if not domain_record:
            return {"success": True, "data": None}
        data = await WhoisRepository(conn).get_by_domain_id(domain_record["id"])
    return {"success": True, "data": data}


@router.post("/lookup")
async def whois_lookup(req: WhoisLookupRequest, current_user: dict = Depends(get_current_user)):
    client_id = get_client_id(current_user)
    result = await lookup_whois(req.domain, client=str(client_id))
    if "error" not in result:
        pool = await get_pool()
        async with pool.acquire() as conn:
            domain_record = await DomainRepository(conn).get_by_domain(client_id, req.domain)
            if domain_record:
                await WhoisRepository(conn).upsert(
                    domain_id=domain_record["id"],
                    registrant_name=result.get("registrant_name"),
                    registrant_org=result.get("registrant_org"),
                    registrant_email=result.get("registrant_email"),
                    registrar=result.get("registrar"),
                    creation_date=result.get("creation_date"),
                    expiration_date=result.get("expiration_date"),
                    name_servers=str(result.get("name_servers", [])),
                )
    return {"success": True, "data": result}


@router.post("/phone")
async def phone_analyze(req: PhoneAnalyzeRequest, current_user: dict = Depends(get_current_user)):
    result = analyze_phone_number(req.number, default_region=req.region)
    return {"success": True, "data": result}
