"""Domain accessibility validation via HTTP."""

import asyncio
from dataclasses import dataclass
from typing import Optional

import aiohttp

from backend.utils.logger import get_logger

log = get_logger("domain_validator")


@dataclass
class ValidationResult:
    is_valid: bool
    status_code: Optional[int] = None
    is_bot_protected: bool = False
    has_cloudflare: bool = False
    redirect_url: Optional[str] = None
    error: Optional[str] = None


async def validate_domain(
    domain: str,
    timeout: int = 20,
    client: str = "",
) -> ValidationResult:
    """Check if a domain is accessible via HTTP.

    Returns ValidationResult with status info.
    Considers 401/403 as potentially bot-protected (still scrape-worthy).
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,tr;q=0.8",
    }

    url = f"https://{domain}"

    try:
        connector = aiohttp.TCPConnector(ssl=False)
        async with aiohttp.ClientSession(
            connector=connector,
            timeout=aiohttp.ClientTimeout(total=timeout),
        ) as session:
            # Try HTTPS first
            log.debug("[%s] Attempt 1: HTTPS HEAD %s", domain, url)
            try:
                async with session.head(
                    url,
                    headers=headers,
                    allow_redirects=True,
                    max_redirects=5,
                ) as resp:
                    result = _analyze_response(resp, domain)
                    log.debug("[%s] HTTPS HEAD status=%s valid=%s bot_protected=%s", domain, result.status_code, result.is_valid, result.is_bot_protected)
                    if result.is_valid or result.is_bot_protected:
                        log.info("[%s] Validation complete: valid=%s status=%s cloudflare=%s bot_protected=%s", domain, result.is_valid, result.status_code, result.has_cloudflare, result.is_bot_protected)
                        return result
            except Exception as e:
                log.debug("[%s] HTTPS HEAD failed: %s", domain, str(e)[:200])

            # Fallback to HTTP
            url = f"http://{domain}"
            log.debug("[%s] Attempt 2: HTTP HEAD %s", domain, url)
            try:
                async with session.head(
                    url,
                    headers=headers,
                    allow_redirects=True,
                    max_redirects=5,
                ) as resp:
                    result = _analyze_response(resp, domain)
                    log.debug("[%s] HTTP HEAD status=%s valid=%s bot_protected=%s", domain, result.status_code, result.is_valid, result.is_bot_protected)
                    log.info("[%s] Validation complete: valid=%s status=%s cloudflare=%s bot_protected=%s", domain, result.is_valid, result.status_code, result.has_cloudflare, result.is_bot_protected)
                    return result
            except Exception as e:
                log.debug("[%s] HTTP HEAD failed: %s", domain, str(e)[:200])

            # Final try with GET
            log.debug("[%s] Attempt 3: HTTPS GET https://%s", domain, domain)
            try:
                async with session.get(
                    f"https://{domain}",
                    headers=headers,
                    allow_redirects=True,
                    max_redirects=5,
                ) as resp:
                    result = _analyze_response(resp, domain)
                    log.debug("[%s] HTTPS GET status=%s valid=%s bot_protected=%s", domain, result.status_code, result.is_valid, result.is_bot_protected)
                    log.info("[%s] Validation complete: valid=%s status=%s cloudflare=%s bot_protected=%s", domain, result.is_valid, result.status_code, result.has_cloudflare, result.is_bot_protected)
                    return result
            except Exception as e:
                log.debug("[%s] HTTPS GET failed: %s", domain, str(e)[:200])
                log.info("[%s] Validation failed after all attempts: %s", domain, str(e)[:200])
                return ValidationResult(
                    is_valid=False,
                    error=str(e)[:200],
                )

    except Exception as e:
        log.info("[%s] Validation error (session creation): %s", domain, str(e)[:200])
        return ValidationResult(
            is_valid=False,
            error=str(e)[:200],
        )


def _analyze_response(resp: aiohttp.ClientResponse, domain: str) -> ValidationResult:
    """Analyze HTTP response for domain validation."""
    status = resp.status
    headers = resp.headers

    # Check for Cloudflare
    has_cf = any(
        h in headers
        for h in ("cf-ray", "cf-cache-status", "cf-request-id")
    )

    if has_cf:
        log.debug("[%s] Cloudflare detected (status=%s)", domain, status)

    # Check for bot protection
    is_bot_protected = status in (401, 403, 503)
    if has_cf and status == 403:
        is_bot_protected = True

    if is_bot_protected:
        log.debug("[%s] Bot protection detected (status=%s, cloudflare=%s)", domain, status, has_cf)

    # Valid responses
    is_valid = 200 <= status < 400

    # Get redirect URL
    redirect_url = str(resp.url) if str(resp.url) != f"https://{domain}" else None

    if redirect_url:
        log.debug("[%s] Redirect detected: %s", domain, redirect_url)

    return ValidationResult(
        is_valid=is_valid,
        status_code=status,
        is_bot_protected=is_bot_protected,
        has_cloudflare=has_cf,
        redirect_url=redirect_url,
    )
