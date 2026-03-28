"""FastAPI application entry point — Merka Mail Scraper v1.0"""

import sys
import asyncio

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded

from backend.config import get_settings
from backend.db.connection import init_db, close_pool, reset_stuck_jobs
from backend.utils.logger import get_logger
from backend.utils.ws_broadcaster import broadcaster
from backend.middleware.security import SecurityHeadersMiddleware, limiter, rate_limit_handler

# Import routers
from backend.api.websocket import router as ws_router
from backend.api.auth import router as auth_router
from backend.api.clients import router as clients_router
from backend.api.settings import router as settings_router
from backend.api.crawler import router as crawler_router
from backend.api.database import router as database_router
from backend.api.blacklist import router as blacklist_router
from backend.api.email_discovery import router as email_discovery_router
from backend.api.linkedin import router as linkedin_router
from backend.api.social_media import router as social_media_router
from backend.api.whois_phone import router as whois_phone_router
from backend.api.export import router as export_router
from backend.api.csv_merge import router as csv_merge_router
from backend.api.business import router as business_router

log = get_logger("main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # STARTUP
    log.info("Starting Merka Mail Scraper v1.0...")
    pool = await init_db()
    app.state.pool = pool
    await reset_stuck_jobs(pool)
    log.info("Server ready")
    yield
    # SHUTDOWN
    log.info("Shutting down...")
    from backend.core.browser_pool import browser_pool
    await browser_pool.close()
    await close_pool()
    log.info("Shutdown complete")


app = FastAPI(
    title="Merka Mail Scraper",
    version="1.0.0",
    description="Multi-client email intelligence platform",
    lifespan=lifespan,
)

# Rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_handler)

# Security headers
app.add_middleware(SecurityHeadersMiddleware)

# CORS
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(ws_router)
app.include_router(auth_router)
app.include_router(clients_router)
app.include_router(settings_router)
app.include_router(crawler_router)
app.include_router(database_router)
app.include_router(blacklist_router)
app.include_router(email_discovery_router)
app.include_router(linkedin_router)
app.include_router(social_media_router)
app.include_router(whois_phone_router)
app.include_router(export_router)
app.include_router(csv_merge_router)
app.include_router(business_router)


@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "version": "1.0.0",
        "ws_connections": broadcaster.get_connection_count(),
    }
