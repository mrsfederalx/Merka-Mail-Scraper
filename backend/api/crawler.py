"""Website crawler API endpoints."""

from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel

from backend.db.connection import get_pool
from backend.middleware.auth import get_current_user, get_client_id
from backend.middleware.security import limiter
from backend.core.task_manager import get_task_manager
from backend.services.domain_normalizer import deduplicate_domains

router = APIRouter(prefix="/api/crawler", tags=["crawler"])


class StartCrawlerRequest(BaseModel):
    domains: list[str]
    concurrency: int = 3
    delay: int = 3000
    timeout: int = 30000


@router.post("/start")
@limiter.limit("3/minute")
async def start_crawler(
    request: Request,
    req: StartCrawlerRequest,
    current_user: dict = Depends(get_current_user),
):
    client_id = get_client_id(current_user)
    domains = deduplicate_domains(req.domains)
    if not domains:
        raise HTTPException(status_code=400, detail="No valid domains provided")

    pool = await get_pool()
    tm = get_task_manager(client_id)
    result = await tm.start(
        pool=pool,
        domains=domains,
        concurrency=req.concurrency,
        delay_ms=req.delay,
        timeout_ms=req.timeout,
    )

    if "error" in result:
        raise HTTPException(status_code=409, detail=result["error"])

    return {"success": True, "data": result}


@router.get("/status")
async def get_status(current_user: dict = Depends(get_current_user)):
    client_id = get_client_id(current_user)
    tm = get_task_manager(client_id)
    return {
        "success": True,
        "data": {
            "is_running": tm.is_running,
            "is_paused": tm.is_paused,
            **tm.stats,
        },
    }


@router.post("/pause")
async def pause_crawler(current_user: dict = Depends(get_current_user)):
    client_id = get_client_id(current_user)
    tm = get_task_manager(client_id)
    result = await tm.pause()
    if "error" in result:
        raise HTTPException(status_code=409, detail=result["error"])
    return {"success": True, "data": result}


@router.post("/resume")
async def resume_crawler(current_user: dict = Depends(get_current_user)):
    client_id = get_client_id(current_user)
    tm = get_task_manager(client_id)
    result = await tm.resume()
    if "error" in result:
        raise HTTPException(status_code=409, detail=result["error"])
    return {"success": True, "data": result}


@router.post("/stop")
async def stop_crawler(current_user: dict = Depends(get_current_user)):
    client_id = get_client_id(current_user)
    tm = get_task_manager(client_id)
    result = await tm.stop()
    if "error" in result:
        raise HTTPException(status_code=409, detail=result["error"])
    return {"success": True, "data": result}
