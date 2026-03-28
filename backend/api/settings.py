"""Settings management API endpoints."""

import io
import json
import aiohttp

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional

from backend.config import get_app_settings, reload_app_settings
from backend.middleware.auth import get_current_user, require_admin
from backend.utils.logger import get_logger

log = get_logger("settings")
router = APIRouter(prefix="/api/settings", tags=["settings"])


class UpdateSettingsRequest(BaseModel):
    api_keys: Optional[dict] = None
    processing: Optional[dict] = None
    proxy: Optional[dict] = None
    ai_classification: Optional[dict] = None
    email_discovery: Optional[dict] = None
    linkedin_dorking: Optional[dict] = None


@router.get("")
async def get_all_settings(current_user: dict = Depends(get_current_user)):
    settings = get_app_settings()
    return {"success": True, "data": settings.model_dump()}


@router.put("")
async def update_settings(req: UpdateSettingsRequest, current_user: dict = Depends(require_admin)):
    settings = get_app_settings()
    for section_name, section_data in [
        ("api_keys", req.api_keys),
        ("processing", req.processing),
        ("proxy", req.proxy),
        ("ai_classification", req.ai_classification),
        ("email_discovery", req.email_discovery),
        ("linkedin_dorking", req.linkedin_dorking),
    ]:
        if section_data:
            section = getattr(settings, section_name)
            for k, v in section_data.items():
                if hasattr(section, k):
                    setattr(section, k, v)
    settings.save()
    return {"success": True, "data": settings.model_dump()}


@router.post("/reload")
async def reload(current_user: dict = Depends(require_admin)):
    settings = reload_app_settings()
    return {"success": True, "data": settings.model_dump()}


class TestKeyRequest(BaseModel):
    provider: str
    key: str


@router.put("/test-key")
async def test_api_key(req: TestKeyRequest, current_user: dict = Depends(require_admin)):
    provider = req.provider.lower()
    key = req.key.strip()
    if not key:
        return {"success": False, "error": "Key is empty"}
    try:
        if provider == "gemini":
            async with aiohttp.ClientSession() as session:
                url = f"https://generativelanguage.googleapis.com/v1beta/models?key={key}"
                async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                    return {"success": True, "data": {"valid": resp.status == 200}}
        elif provider == "groq":
            async with aiohttp.ClientSession() as session:
                headers = {"Authorization": f"Bearer {key}"}
                async with session.get("https://api.groq.com/openai/v1/models", headers=headers, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                    return {"success": True, "data": {"valid": resp.status == 200}}
        elif provider == "ollama":
            async with aiohttp.ClientSession() as session:
                async with session.get(f"{key}/api/tags", timeout=aiohttp.ClientTimeout(total=5)) as resp:
                    return {"success": True, "data": {"valid": resp.status == 200}}
        else:
            return {"success": False, "error": f"Unknown provider: {provider}"}
    except Exception as e:
        log.warning(f"API key test failed for {provider}: {e}")
        return {"success": True, "data": {"valid": False}}


@router.get("/backup")
async def backup_settings(current_user: dict = Depends(require_admin)):
    settings = get_app_settings()
    content = json.dumps(settings.model_dump(), indent=2, ensure_ascii=False)
    return StreamingResponse(
        io.BytesIO(content.encode("utf-8")),
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="settings_backup.json"'},
    )
