"""asyncpg connection pool for PostgreSQL."""

import asyncpg
from typing import Optional
from backend.config import get_settings
from backend.utils.logger import get_logger

log = get_logger("database")

_pool: Optional[asyncpg.Pool] = None


async def create_pool() -> asyncpg.Pool:
    """Create asyncpg connection pool."""
    settings = get_settings()
    log.info("Creating PostgreSQL connection pool...")
    pool = await asyncpg.create_pool(
        dsn=settings.database_url,
        min_size=settings.db_pool_min,
        max_size=settings.db_pool_max,
    )
    log.info(f"PostgreSQL pool ready (min={settings.db_pool_min}, max={settings.db_pool_max})")
    return pool


async def get_pool() -> asyncpg.Pool:
    """Get the global connection pool (must call create_pool first)."""
    if _pool is None:
        raise RuntimeError("Database pool not initialized. Call create_pool() first.")
    return _pool


async def init_db() -> asyncpg.Pool:
    """Initialize pool and run schema migrations."""
    global _pool
    _pool = await create_pool()
    from backend.db.migrations import run_migrations
    await run_migrations(_pool)
    return _pool


async def close_pool() -> None:
    """Close the connection pool gracefully."""
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
        log.info("PostgreSQL pool closed")


async def reset_stuck_jobs(pool: asyncpg.Pool) -> int:
    """Reset stuck 'processing' domains and running jobs on startup."""
    async with pool.acquire() as conn:
        result = await conn.execute(
            "UPDATE domains SET status='pending', updated_at=NOW() WHERE status='processing'"
        )
        await conn.execute(
            "UPDATE processing_jobs SET status='failed', updated_at=NOW() WHERE status='running'"
        )
    count = int(result.split()[-1])
    if count > 0:
        log.info(f"Recovery: reset {count} stuck 'processing' domains to 'pending'")
    return count
