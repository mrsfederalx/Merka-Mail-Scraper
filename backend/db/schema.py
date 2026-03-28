"""PostgreSQL schema definition."""

SCHEMA_VERSION = 1

# Default blacklist seeds
DEFAULT_BLACKLIST_EMAILS = [
    "noreply@", "no-reply@", "donotreply@", "do-not-reply@",
    "mailer-daemon@", "postmaster@", "abuse@", "spam@",
    "newsletter@", "news@", "marketing@", "promo@",
    "notifications@", "alerts@", "support@", "help@",
    "info@", "contact@", "hello@", "team@",
    "admin@", "administrator@",
]

DEFAULT_BLACKLIST_DOMAINS = [
    "gmail.com", "yahoo.com", "hotmail.com", "outlook.com",
    "live.com", "icloud.com", "me.com", "mac.com",
    "aol.com", "protonmail.com", "tutanota.com",
    "yandex.com", "mail.com", "gmx.com",
]

CREATE_TABLES_SQL = """
-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_version (
    version    INTEGER PRIMARY KEY,
    applied_at TIMESTAMP DEFAULT NOW()
);

-- Clients
CREATE TABLE IF NOT EXISTS clients (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    slug        TEXT UNIQUE NOT NULL,
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMP DEFAULT NOW()
);

-- Users
CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    email           TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    name            TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin', 'user')),
    client_id       INTEGER REFERENCES clients(id) ON DELETE SET NULL,
    is_active       BOOLEAN DEFAULT TRUE,
    failed_attempts INTEGER DEFAULT 0,
    locked_until    TIMESTAMP,
    last_login      TIMESTAMP,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

-- Refresh tokens
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT UNIQUE NOT NULL,
    expires_at  TIMESTAMP NOT NULL,
    revoked     BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id    ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);

-- Domains
CREATE TABLE IF NOT EXISTS domains (
    id                  SERIAL PRIMARY KEY,
    client_id           INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    domain              TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'pending'
                            CHECK(status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),
    platform            TEXT,
    method              TEXT,
    error_code          TEXT,
    error_message       TEXT,
    processing_time_ms  INTEGER,
    has_cloudflare      BOOLEAN DEFAULT FALSE,
    created_at          TIMESTAMP DEFAULT NOW(),
    processed_at        TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT NOW(),
    UNIQUE(client_id, domain)
);

CREATE INDEX IF NOT EXISTS idx_domains_client_id ON domains(client_id);
CREATE INDEX IF NOT EXISTS idx_domains_status    ON domains(status);
CREATE INDEX IF NOT EXISTS idx_domains_platform  ON domains(platform);

-- Emails
CREATE TABLE IF NOT EXISTS emails (
    id                  SERIAL PRIMARY KEY,
    domain_id           INTEGER NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    email               TEXT NOT NULL,
    source              TEXT,
    source_url          TEXT,
    html_context        TEXT,
    tier                INTEGER,
    classification      TEXT,
    confidence          FLOAT,
    suggested_role      TEXT,
    is_decision_maker   BOOLEAN DEFAULT FALSE,
    verification_status TEXT DEFAULT 'unverified',
    mx_valid            BOOLEAN,
    smtp_verified       BOOLEAN,
    created_at          TIMESTAMP DEFAULT NOW(),
    UNIQUE(domain_id, email)
);

CREATE INDEX IF NOT EXISTS idx_emails_domain_id         ON emails(domain_id);
CREATE INDEX IF NOT EXISTS idx_emails_tier              ON emails(tier);
CREATE INDEX IF NOT EXISTS idx_emails_is_decision_maker ON emails(is_decision_maker);

-- Contacts
CREATE TABLE IF NOT EXISTS contacts (
    id              SERIAL PRIMARY KEY,
    domain_id       INTEGER NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    full_name       TEXT,
    first_name      TEXT,
    last_name       TEXT,
    role            TEXT,
    linkedin_url    TEXT,
    source          TEXT,
    search_query    TEXT,
    score           INTEGER DEFAULT 0,
    email_found     TEXT,
    email_verified  BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contacts_domain_id ON contacts(domain_id);

-- Social links
CREATE TABLE IF NOT EXISTS social_links (
    id          SERIAL PRIMARY KEY,
    domain_id   INTEGER NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    platform    TEXT NOT NULL,
    url         TEXT NOT NULL,
    source      TEXT,
    created_at  TIMESTAMP DEFAULT NOW(),
    UNIQUE(domain_id, platform, url)
);

-- WHOIS data
CREATE TABLE IF NOT EXISTS whois_data (
    id                SERIAL PRIMARY KEY,
    domain_id         INTEGER NOT NULL UNIQUE REFERENCES domains(id) ON DELETE CASCADE,
    registrant_name   TEXT,
    registrant_org    TEXT,
    registrant_email  TEXT,
    registrar         TEXT,
    creation_date     TEXT,
    expiration_date   TEXT,
    name_servers      TEXT,
    raw_data          TEXT,
    phone_numbers     TEXT,
    created_at        TIMESTAMP DEFAULT NOW()
);

-- Processing jobs
CREATE TABLE IF NOT EXISTS processing_jobs (
    id               SERIAL PRIMARY KEY,
    client_id        INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    job_type         TEXT NOT NULL,
    status           TEXT NOT NULL DEFAULT 'running'
                         CHECK(status IN ('running', 'paused', 'completed', 'failed')),
    total_items      INTEGER DEFAULT 0,
    processed_items  INTEGER DEFAULT 0,
    successful_items INTEGER DEFAULT 0,
    failed_items     INTEGER DEFAULT 0,
    config           TEXT,
    started_at       TIMESTAMP DEFAULT NOW(),
    completed_at     TIMESTAMP,
    updated_at       TIMESTAMP DEFAULT NOW()
);

-- Blacklists
CREATE TABLE IF NOT EXISTS blacklist_emails (
    id         SERIAL PRIMARY KEY,
    client_id  INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    pattern    TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(client_id, pattern)
);

CREATE TABLE IF NOT EXISTS blacklist_domains (
    id         SERIAL PRIMARY KEY,
    client_id  INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    domain     TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(client_id, domain)
);
"""
