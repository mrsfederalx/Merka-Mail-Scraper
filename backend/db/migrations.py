"""PostgreSQL schema migrations."""

import asyncpg
from backend.db.schema import (
    CREATE_TABLES_SQL, SCHEMA_VERSION, BUSINESS_TABLE_SQL, LEADS_VIEW_SQL,
    DEFAULT_BLACKLIST_EMAILS, DEFAULT_BLACKLIST_DOMAINS,
)
from backend.config import get_settings
from backend.utils.logger import get_logger
from passlib.context import CryptContext

log = get_logger("migrations")
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)

# Future migrations: add SQL per version number
MIGRATIONS: dict[int, list[str]] = {
    2: [BUSINESS_TABLE_SQL],
    3: [LEADS_VIEW_SQL],
}


async def run_migrations(pool: asyncpg.Pool) -> None:
    """Run schema creation and pending migrations."""
    async with pool.acquire() as conn:
        # Create all tables
        await conn.execute(CREATE_TABLES_SQL)

        # Check current schema version
        row = await conn.fetchrow(
            "SELECT version FROM schema_version ORDER BY version DESC LIMIT 1"
        )
        current_version = row["version"] if row else 0

        if current_version == 0:
            log.info("First-time database initialization, seeding defaults...")
            await _seed_defaults(conn)
            await conn.execute(
                "INSERT INTO schema_version (version) VALUES ($1) ON CONFLICT DO NOTHING",
                SCHEMA_VERSION,
            )
            log.info(f"Schema version set to {SCHEMA_VERSION}")
        else:
            log.info(f"Schema version: {current_version}")
            for version in range(current_version + 1, SCHEMA_VERSION + 1):
                if version in MIGRATIONS:
                    log.info(f"Running migration v{version}...")
                    for sql in MIGRATIONS[version]:
                        try:
                            await conn.execute(sql)
                        except Exception as e:
                            log.warning(f"Migration step skipped: {e}")
                    await conn.execute(
                        "INSERT INTO schema_version (version) VALUES ($1) ON CONFLICT DO NOTHING",
                        version,
                    )
                    log.info(f"Migration v{version} complete")


async def _seed_defaults(conn: asyncpg.Connection) -> None:
    """Seed default client and admin user."""
    settings = get_settings()

    # Default client
    client_id = await conn.fetchval(
        """INSERT INTO clients (name, slug) VALUES ('Default', 'default')
           ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name
           RETURNING id"""
    )
    log.info(f"Default client seeded (id={client_id})")

    # Admin user
    password_hash = pwd_context.hash(settings.admin_password)
    user_id = await conn.fetchval(
        """INSERT INTO users (email, password_hash, name, role, client_id)
           VALUES ($1, $2, $3, 'admin', $4)
           ON CONFLICT (email) DO NOTHING
           RETURNING id""",
        settings.admin_email, password_hash, settings.admin_name, client_id,
    )
    if user_id:
        log.info(f"Admin user seeded: {settings.admin_email}")
    else:
        log.info(f"Admin user already exists: {settings.admin_email}")

    # Default blacklists for the default client
    for pattern in DEFAULT_BLACKLIST_EMAILS:
        await conn.execute(
            "INSERT INTO blacklist_emails (client_id, pattern) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            client_id, pattern,
        )
    for domain in DEFAULT_BLACKLIST_DOMAINS:
        await conn.execute(
            "INSERT INTO blacklist_domains (client_id, domain) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            client_id, domain,
        )
    log.info("Default blacklists seeded")
