"""CRUD operations for all database tables — asyncpg / PostgreSQL."""

import json
from typing import Optional
import asyncpg


class DomainRepository:
    """CRUD for domains table."""

    def __init__(self, conn: asyncpg.Connection):
        self.conn = conn

    async def upsert(self, client_id: int, domain: str, status: str = "pending") -> int:
        row = await self.conn.fetchrow(
            """INSERT INTO domains (client_id, domain, status) VALUES ($1, $2, $3)
               ON CONFLICT (client_id, domain) DO UPDATE SET updated_at=NOW()
               RETURNING id""",
            client_id, domain, status,
        )
        return row["id"]

    async def bulk_insert_pending(self, client_id: int, domains: list[str]) -> int:
        count = 0
        for domain in domains:
            try:
                await self.conn.execute(
                    "INSERT INTO domains (client_id, domain, status) VALUES ($1, $2, 'pending') ON CONFLICT DO NOTHING",
                    client_id, domain,
                )
                count += 1
            except Exception:
                pass
        return count

    async def update_status(
        self,
        client_id: int,
        domain: str,
        status: str,
        platform: Optional[str] = None,
        method: Optional[str] = None,
        error_code: Optional[str] = None,
        error_message: Optional[str] = None,
        processing_time_ms: Optional[int] = None,
        has_cloudflare: bool = False,
    ) -> None:
        await self.conn.execute(
            """UPDATE domains SET
                status=$1, platform=$2, method=$3, error_code=$4, error_message=$5,
                processing_time_ms=$6, has_cloudflare=$7,
                processed_at=NOW(), updated_at=NOW()
               WHERE client_id=$8 AND domain=$9""",
            status, platform, method, error_code, error_message,
            processing_time_ms, has_cloudflare, client_id, domain,
        )

    async def get_by_domain(self, client_id: int, domain: str) -> Optional[dict]:
        row = await self.conn.fetchrow(
            "SELECT * FROM domains WHERE client_id=$1 AND domain=$2",
            client_id, domain,
        )
        return dict(row) if row else None

    async def get_by_id(self, domain_id: int, client_id: int) -> Optional[dict]:
        row = await self.conn.fetchrow(
            "SELECT * FROM domains WHERE id=$1 AND client_id=$2",
            domain_id, client_id,
        )
        return dict(row) if row else None

    async def get_pending_domains(self, client_id: int) -> list[str]:
        rows = await self.conn.fetch(
            "SELECT domain FROM domains WHERE client_id=$1 AND status='pending' ORDER BY id",
            client_id,
        )
        return [row["domain"] for row in rows]

    async def get_filtered(
        self,
        client_id: int,
        status: Optional[str] = None,
        platform: Optional[str] = None,
        method: Optional[str] = None,
        search: Optional[str] = None,
        page: int = 1,
        limit: int = 50,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> tuple[list[dict], int]:
        conditions = ["d.client_id = $1"]
        params: list = [client_id]
        idx = 2

        if status:
            conditions.append(f"d.status = ${idx}")
            params.append(status); idx += 1
        if platform:
            conditions.append(f"d.platform = ${idx}")
            params.append(platform); idx += 1
        if method:
            conditions.append(f"d.method = ${idx}")
            params.append(method); idx += 1
        if search:
            conditions.append(f"d.domain ILIKE ${idx}")
            params.append(f"%{search}%"); idx += 1
        if start_date:
            conditions.append(f"d.processed_at >= ${idx}")
            params.append(start_date); idx += 1
        if end_date:
            conditions.append(f"d.processed_at <= ${idx}")
            params.append(end_date); idx += 1

        where = " WHERE " + " AND ".join(conditions)
        offset = (page - 1) * limit

        count_row = await self.conn.fetchrow(
            f"SELECT COUNT(*) as cnt FROM domains d{where}", *params
        )
        total = count_row["cnt"] if count_row else 0

        rows = await self.conn.fetch(
            f"SELECT d.* FROM domains d{where} ORDER BY d.id DESC LIMIT ${idx} OFFSET ${idx+1}",
            *params, limit, offset,
        )
        return [dict(r) for r in rows], total

    async def get_stats(self, client_id: int) -> dict:
        row = await self.conn.fetchrow(
            """SELECT
                COUNT(*) as total,
                SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as failed,
                SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status='processing' THEN 1 ELSE 0 END) as processing,
                SUM(CASE WHEN status='skipped' THEN 1 ELSE 0 END) as skipped
               FROM domains WHERE client_id=$1""",
            client_id,
        )
        return dict(row) if row else {}

    async def delete_by_id(self, domain_id: int, client_id: int) -> bool:
        result = await self.conn.execute(
            "DELETE FROM domains WHERE id=$1 AND client_id=$2", domain_id, client_id
        )
        return result == "DELETE 1"

    async def delete_all(self, client_id: int) -> int:
        result = await self.conn.execute(
            "DELETE FROM domains WHERE client_id=$1", client_id
        )
        return int(result.split()[-1])


class EmailRepository:
    """CRUD for emails table."""

    def __init__(self, conn: asyncpg.Connection):
        self.conn = conn

    async def insert(
        self,
        domain_id: int,
        email: str,
        source: Optional[str] = None,
        source_url: Optional[str] = None,
        html_context: Optional[str] = None,
    ) -> Optional[int]:
        try:
            row = await self.conn.fetchrow(
                """INSERT INTO emails (domain_id, email, source, source_url, html_context)
                   VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING RETURNING id""",
                domain_id, email, source, source_url, html_context,
            )
            return row["id"] if row else None
        except Exception:
            return None

    async def update_classification(
        self,
        email_id: int,
        tier: int,
        classification: str,
        confidence: float,
        suggested_role: Optional[str] = None,
        is_decision_maker: bool = False,
    ) -> None:
        await self.conn.execute(
            """UPDATE emails SET
                tier=$1, classification=$2, confidence=$3, suggested_role=$4, is_decision_maker=$5
               WHERE id=$6""",
            tier, classification, confidence, suggested_role, is_decision_maker, email_id,
        )

    async def update_verification(
        self,
        email_id: int,
        verification_status: str,
        mx_valid: Optional[bool] = None,
        smtp_verified: Optional[bool] = None,
    ) -> None:
        await self.conn.execute(
            "UPDATE emails SET verification_status=$1, mx_valid=$2, smtp_verified=$3 WHERE id=$4",
            verification_status, mx_valid, smtp_verified, email_id,
        )

    async def get_by_domain_id(self, domain_id: int) -> list[dict]:
        rows = await self.conn.fetch(
            "SELECT * FROM emails WHERE domain_id=$1 ORDER BY tier ASC NULLS LAST, confidence DESC NULLS LAST",
            domain_id,
        )
        return [dict(r) for r in rows]

    async def get_all_with_domain(
        self,
        client_id: int,
        tier: Optional[int] = None,
        classification: Optional[str] = None,
        search: Optional[str] = None,
        page: int = 1,
        limit: int = 50,
    ) -> tuple[list[dict], int]:
        conditions = ["d.client_id = $1"]
        params: list = [client_id]
        idx = 2

        if tier is not None:
            conditions.append(f"e.tier = ${idx}")
            params.append(tier); idx += 1
        if classification:
            conditions.append(f"e.classification = ${idx}")
            params.append(classification); idx += 1
        if search:
            conditions.append(f"(e.email ILIKE ${idx} OR d.domain ILIKE ${idx})")
            params.append(f"%{search}%"); idx += 1

        where = " WHERE " + " AND ".join(conditions)
        offset = (page - 1) * limit

        count_row = await self.conn.fetchrow(
            f"SELECT COUNT(*) as cnt FROM emails e JOIN domains d ON e.domain_id=d.id{where}", *params
        )
        total = count_row["cnt"] if count_row else 0

        rows = await self.conn.fetch(
            f"""SELECT e.*, d.domain FROM emails e
                JOIN domains d ON e.domain_id = d.id
                {where}
                ORDER BY e.is_decision_maker DESC, e.tier DESC NULLS LAST, e.confidence DESC NULLS LAST
                LIMIT ${idx} OFFSET ${idx+1}""",
            *params, limit, offset,
        )
        return [dict(r) for r in rows], total

    async def get_stats(self, client_id: int) -> dict:
        row = await self.conn.fetchrow(
            """SELECT
                COUNT(*) as total,
                SUM(CASE WHEN e.tier=1 THEN 1 ELSE 0 END) as tier_1_junk,
                SUM(CASE WHEN e.tier=2 THEN 1 ELSE 0 END) as tier_2_generic,
                SUM(CASE WHEN e.tier=3 THEN 1 ELSE 0 END) as tier_3_department,
                SUM(CASE WHEN e.tier=4 THEN 1 ELSE 0 END) as tier_4_personal,
                SUM(CASE WHEN e.is_decision_maker THEN 1 ELSE 0 END) as decision_makers,
                SUM(CASE WHEN e.verification_status='valid' THEN 1 ELSE 0 END) as verified
               FROM emails e JOIN domains d ON e.domain_id=d.id
               WHERE d.client_id=$1""",
            client_id,
        )
        return dict(row) if row else {}

    async def delete_by_id(self, email_id: int) -> bool:
        result = await self.conn.execute("DELETE FROM emails WHERE id=$1", email_id)
        return result == "DELETE 1"


class ContactRepository:
    """CRUD for contacts table."""

    def __init__(self, conn: asyncpg.Connection):
        self.conn = conn

    async def insert(
        self,
        domain_id: int,
        full_name: Optional[str] = None,
        first_name: Optional[str] = None,
        last_name: Optional[str] = None,
        role: Optional[str] = None,
        linkedin_url: Optional[str] = None,
        source: Optional[str] = None,
        search_query: Optional[str] = None,
        score: int = 0,
    ) -> int:
        row = await self.conn.fetchrow(
            """INSERT INTO contacts
               (domain_id, full_name, first_name, last_name, role, linkedin_url, source, search_query, score)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id""",
            domain_id, full_name, first_name, last_name, role,
            linkedin_url, source, search_query, score,
        )
        return row["id"]

    async def get_by_domain_id(self, domain_id: int) -> list[dict]:
        rows = await self.conn.fetch(
            "SELECT * FROM contacts WHERE domain_id=$1 ORDER BY score DESC, id", domain_id
        )
        return [dict(r) for r in rows]

    async def get_decision_makers_by_domain(self, domain_id: int) -> list[dict]:
        rows = await self.conn.fetch(
            "SELECT * FROM contacts WHERE domain_id=$1 AND score > 0 ORDER BY score DESC",
            domain_id,
        )
        return [dict(r) for r in rows]

    async def update_score(self, contact_id: int, score: int) -> None:
        await self.conn.execute(
            "UPDATE contacts SET score=$1 WHERE id=$2", score, contact_id
        )

    async def update_email_found(self, contact_id: int, email: str, verified: bool = False) -> None:
        await self.conn.execute(
            "UPDATE contacts SET email_found=$1, email_verified=$2 WHERE id=$3",
            email, verified, contact_id,
        )

    async def get_all_with_domain_name(
        self,
        client_id: int,
        search: Optional[str] = None,
        page: int = 1,
        limit: int = 50,
    ) -> tuple[list[dict], int]:
        conditions = ["d.client_id = $1"]
        params: list = [client_id]
        idx = 2

        if search:
            conditions.append(
                f"(c.full_name ILIKE ${idx} OR c.role ILIKE ${idx} OR d.domain ILIKE ${idx} OR c.email_found ILIKE ${idx})"
            )
            params.append(f"%{search}%"); idx += 1

        where = " WHERE " + " AND ".join(conditions)
        offset = (page - 1) * limit

        count_row = await self.conn.fetchrow(
            f"SELECT COUNT(*) as cnt FROM contacts c JOIN domains d ON c.domain_id=d.id{where}", *params
        )
        total = count_row["cnt"] if count_row else 0

        rows = await self.conn.fetch(
            f"""SELECT c.*, d.domain FROM contacts c
                JOIN domains d ON c.domain_id = d.id
                {where}
                ORDER BY c.score DESC, c.id DESC LIMIT ${idx} OFFSET ${idx+1}""",
            *params, limit, offset,
        )
        return [dict(r) for r in rows], total


class SocialLinkRepository:
    """CRUD for social_links table."""

    def __init__(self, conn: asyncpg.Connection):
        self.conn = conn

    async def insert(
        self,
        domain_id: int,
        platform: str,
        url: str,
        source: Optional[str] = None,
    ) -> Optional[int]:
        try:
            row = await self.conn.fetchrow(
                """INSERT INTO social_links (domain_id, platform, url, source)
                   VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING id""",
                domain_id, platform, url, source,
            )
            return row["id"] if row else None
        except Exception:
            return None

    async def get_by_domain_id(self, domain_id: int) -> list[dict]:
        rows = await self.conn.fetch(
            "SELECT * FROM social_links WHERE domain_id=$1 ORDER BY platform", domain_id
        )
        return [dict(r) for r in rows]

    async def get_all_grouped(
        self, client_id: int, page: int = 1, limit: int = 50
    ) -> tuple[list[dict], int]:
        offset = (page - 1) * limit
        count_row = await self.conn.fetchrow(
            """SELECT COUNT(DISTINCT s.domain_id) as cnt
               FROM social_links s JOIN domains d ON s.domain_id=d.id
               WHERE d.client_id=$1""",
            client_id,
        )
        total = count_row["cnt"] if count_row else 0
        rows = await self.conn.fetch(
            """SELECT s.*, d.domain FROM social_links s
               JOIN domains d ON s.domain_id = d.id
               WHERE d.client_id=$1
               ORDER BY d.domain, s.platform
               LIMIT $2 OFFSET $3""",
            client_id, limit, offset,
        )
        return [dict(r) for r in rows], total


class WhoisRepository:
    """CRUD for whois_data table."""

    def __init__(self, conn: asyncpg.Connection):
        self.conn = conn

    async def upsert(self, domain_id: int, **kwargs) -> int:
        existing = await self.conn.fetchrow(
            "SELECT id FROM whois_data WHERE domain_id=$1", domain_id
        )
        if existing:
            sets = ", ".join(f"{k}=${i+1}" for i, k in enumerate(kwargs.keys()))
            await self.conn.execute(
                f"UPDATE whois_data SET {sets} WHERE domain_id=${len(kwargs)+1}",
                *kwargs.values(), domain_id,
            )
            return existing["id"]
        else:
            cols = ", ".join(["domain_id"] + list(kwargs.keys()))
            placeholders = ", ".join(f"${i+1}" for i in range(1 + len(kwargs)))
            row = await self.conn.fetchrow(
                f"INSERT INTO whois_data ({cols}) VALUES ({placeholders}) RETURNING id",
                domain_id, *kwargs.values(),
            )
            return row["id"]

    async def get_by_domain_id(self, domain_id: int) -> Optional[dict]:
        row = await self.conn.fetchrow(
            "SELECT * FROM whois_data WHERE domain_id=$1", domain_id
        )
        return dict(row) if row else None


class JobRepository:
    """CRUD for processing_jobs table."""

    def __init__(self, conn: asyncpg.Connection):
        self.conn = conn

    async def create(
        self,
        client_id: int,
        job_type: str,
        total_items: int,
        config: Optional[dict] = None,
    ) -> int:
        row = await self.conn.fetchrow(
            """INSERT INTO processing_jobs (client_id, job_type, status, total_items, config)
               VALUES ($1, $2, 'running', $3, $4) RETURNING id""",
            client_id, job_type, total_items, json.dumps(config) if config else None,
        )
        return row["id"]

    async def update(
        self,
        job_id: int,
        status: Optional[str] = None,
        processed_items: Optional[int] = None,
        successful_items: Optional[int] = None,
        failed_items: Optional[int] = None,
    ) -> None:
        updates = ["updated_at=NOW()"]
        params: list = []
        idx = 1

        if status:
            updates.append(f"status=${idx}"); params.append(status); idx += 1
            if status in ("completed", "failed"):
                updates.append("completed_at=NOW()")
        if processed_items is not None:
            updates.append(f"processed_items=${idx}"); params.append(processed_items); idx += 1
        if successful_items is not None:
            updates.append(f"successful_items=${idx}"); params.append(successful_items); idx += 1
        if failed_items is not None:
            updates.append(f"failed_items=${idx}"); params.append(failed_items); idx += 1

        params.append(job_id)
        await self.conn.execute(
            f"UPDATE processing_jobs SET {', '.join(updates)} WHERE id=${idx}",
            *params,
        )

    async def get_latest(self, client_id: int, job_type: Optional[str] = None) -> Optional[dict]:
        if job_type:
            row = await self.conn.fetchrow(
                "SELECT * FROM processing_jobs WHERE client_id=$1 AND job_type=$2 ORDER BY id DESC LIMIT 1",
                client_id, job_type,
            )
        else:
            row = await self.conn.fetchrow(
                "SELECT * FROM processing_jobs WHERE client_id=$1 ORDER BY id DESC LIMIT 1",
                client_id,
            )
        return dict(row) if row else None


class BlacklistRepository:
    """CRUD for blacklist tables."""

    def __init__(self, conn: asyncpg.Connection):
        self.conn = conn

    async def get_email_patterns(self, client_id: int) -> list[str]:
        rows = await self.conn.fetch(
            "SELECT pattern FROM blacklist_emails WHERE client_id=$1 ORDER BY pattern", client_id
        )
        return [row["pattern"] for row in rows]

    async def add_email_pattern(self, client_id: int, pattern: str) -> bool:
        try:
            await self.conn.execute(
                "INSERT INTO blacklist_emails (client_id, pattern) VALUES ($1, $2) ON CONFLICT DO NOTHING",
                client_id, pattern,
            )
            return True
        except Exception:
            return False

    async def remove_email_pattern(self, client_id: int, pattern: str) -> bool:
        await self.conn.execute(
            "DELETE FROM blacklist_emails WHERE client_id=$1 AND pattern=$2", client_id, pattern
        )
        return True

    async def set_email_patterns(self, client_id: int, patterns: list[str]) -> None:
        await self.conn.execute("DELETE FROM blacklist_emails WHERE client_id=$1", client_id)
        for p in patterns:
            await self.conn.execute(
                "INSERT INTO blacklist_emails (client_id, pattern) VALUES ($1, $2) ON CONFLICT DO NOTHING",
                client_id, p,
            )

    async def get_blocked_domains(self, client_id: int) -> list[str]:
        rows = await self.conn.fetch(
            "SELECT domain FROM blacklist_domains WHERE client_id=$1 ORDER BY domain", client_id
        )
        return [row["domain"] for row in rows]

    async def add_blocked_domain(self, client_id: int, domain: str) -> bool:
        try:
            await self.conn.execute(
                "INSERT INTO blacklist_domains (client_id, domain) VALUES ($1, $2) ON CONFLICT DO NOTHING",
                client_id, domain,
            )
            return True
        except Exception:
            return False

    async def remove_blocked_domain(self, client_id: int, domain: str) -> bool:
        await self.conn.execute(
            "DELETE FROM blacklist_domains WHERE client_id=$1 AND domain=$2", client_id, domain
        )
        return True

    async def set_blocked_domains(self, client_id: int, domains: list[str]) -> None:
        await self.conn.execute("DELETE FROM blacklist_domains WHERE client_id=$1", client_id)
        for d in domains:
            await self.conn.execute(
                "INSERT INTO blacklist_domains (client_id, domain) VALUES ($1, $2) ON CONFLICT DO NOTHING",
                client_id, d,
            )


class ClientRepository:
    """CRUD for clients table."""

    def __init__(self, conn: asyncpg.Connection):
        self.conn = conn

    async def get_all(self) -> list[dict]:
        rows = await self.conn.fetch(
            "SELECT * FROM clients WHERE is_active=TRUE ORDER BY name"
        )
        return [dict(r) for r in rows]

    async def get_by_id(self, client_id: int) -> Optional[dict]:
        row = await self.conn.fetchrow("SELECT * FROM clients WHERE id=$1", client_id)
        return dict(row) if row else None

    async def get_by_slug(self, slug: str) -> Optional[dict]:
        row = await self.conn.fetchrow("SELECT * FROM clients WHERE slug=$1", slug)
        return dict(row) if row else None

    async def create(self, name: str, slug: str) -> int:
        row = await self.conn.fetchrow(
            "INSERT INTO clients (name, slug) VALUES ($1, $2) RETURNING id", name, slug
        )
        return row["id"]

    async def update(self, client_id: int, name: str) -> bool:
        result = await self.conn.execute(
            "UPDATE clients SET name=$1 WHERE id=$2", name, client_id
        )
        return result == "UPDATE 1"

    async def delete(self, client_id: int) -> bool:
        result = await self.conn.execute(
            "UPDATE clients SET is_active=FALSE WHERE id=$1", client_id
        )
        return result == "UPDATE 1"


class UserRepository:
    """CRUD for users table."""

    def __init__(self, conn: asyncpg.Connection):
        self.conn = conn

    async def get_by_email(self, email: str) -> Optional[dict]:
        row = await self.conn.fetchrow("SELECT * FROM users WHERE email=$1", email)
        return dict(row) if row else None

    async def get_by_id(self, user_id: int) -> Optional[dict]:
        row = await self.conn.fetchrow("SELECT * FROM users WHERE id=$1", user_id)
        return dict(row) if row else None

    async def get_all(self) -> list[dict]:
        rows = await self.conn.fetch(
            "SELECT id, email, name, role, client_id, is_active, last_login, created_at FROM users ORDER BY id"
        )
        return [dict(r) for r in rows]

    async def create(
        self,
        email: str,
        password_hash: str,
        name: str,
        role: str = "user",
        client_id: Optional[int] = None,
    ) -> int:
        row = await self.conn.fetchrow(
            """INSERT INTO users (email, password_hash, name, role, client_id)
               VALUES ($1, $2, $3, $4, $5) RETURNING id""",
            email, password_hash, name, role, client_id,
        )
        return row["id"]

    async def update(self, user_id: int, **kwargs) -> bool:
        if not kwargs:
            return False
        kwargs["updated_at"] = "NOW()"
        sets = ", ".join(f"{k}=${i+1}" for i, k in enumerate(kwargs.keys()) if k != "updated_at")
        sets += ", updated_at=NOW()"
        filtered = {k: v for k, v in kwargs.items() if k != "updated_at"}
        values = list(filtered.values())
        values.append(user_id)
        result = await self.conn.execute(
            f"UPDATE users SET {sets} WHERE id=${len(values)}", *values
        )
        return result.startswith("UPDATE")

    async def increment_failed_attempts(self, user_id: int) -> int:
        row = await self.conn.fetchrow(
            "UPDATE users SET failed_attempts=failed_attempts+1, updated_at=NOW() WHERE id=$1 RETURNING failed_attempts",
            user_id,
        )
        return row["failed_attempts"] if row else 0

    async def reset_failed_attempts(self, user_id: int) -> None:
        await self.conn.execute(
            "UPDATE users SET failed_attempts=0, locked_until=NULL, last_login=NOW(), updated_at=NOW() WHERE id=$1",
            user_id,
        )

    async def set_locked_until(self, user_id: int, locked_until) -> None:
        await self.conn.execute(
            "UPDATE users SET locked_until=$1, updated_at=NOW() WHERE id=$2",
            locked_until, user_id,
        )

    async def delete(self, user_id: int) -> bool:
        result = await self.conn.execute("DELETE FROM users WHERE id=$1", user_id)
        return result == "DELETE 1"


class RefreshTokenRepository:
    """CRUD for refresh_tokens table."""

    def __init__(self, conn: asyncpg.Connection):
        self.conn = conn

    async def create(self, user_id: int, token_hash: str, expires_at) -> int:
        row = await self.conn.fetchrow(
            "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3) RETURNING id",
            user_id, token_hash, expires_at,
        )
        return row["id"]

    async def get_by_hash(self, token_hash: str) -> Optional[dict]:
        row = await self.conn.fetchrow(
            "SELECT * FROM refresh_tokens WHERE token_hash=$1", token_hash
        )
        return dict(row) if row else None

    async def revoke(self, token_hash: str) -> None:
        await self.conn.execute(
            "UPDATE refresh_tokens SET revoked=TRUE WHERE token_hash=$1", token_hash
        )

    async def revoke_all_for_user(self, user_id: int) -> None:
        await self.conn.execute(
            "UPDATE refresh_tokens SET revoked=TRUE WHERE user_id=$1", user_id
        )

    async def cleanup_expired(self) -> int:
        result = await self.conn.execute(
            "DELETE FROM refresh_tokens WHERE expires_at < NOW() OR revoked=TRUE"
        )
        return int(result.split()[-1])
