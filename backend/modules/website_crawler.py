"""Website crawler module — main scraping pipeline."""

import asyncio
import time
from typing import Optional
import aiohttp
import asyncpg

from backend.db.repositories import DomainRepository, EmailRepository, SocialLinkRepository
from backend.services.domain_normalizer import normalize_domain
from backend.services.domain_validator import validate_domain
from backend.services.email_extractor import extract_emails_from_html, extract_contact_pages
from backend.services.email_validator import extract_emails_from_text
from backend.services.platform_detector import detect_platform, PlatformInfo
from backend.services.blacklist_service import BlacklistService
from backend.services.proxy_rotation import ua_rotator, proxy_rotator
from backend.core.browser_pool import browser_pool
from backend.utils.logger import get_logger
from backend.utils.ws_broadcaster import broadcaster

_log = get_logger("crawler")


async def crawl_domain(
    domain: str,
    pool: asyncpg.Pool,
    client_id: int,
    email_patterns: list[str],
    blocked_domains: list[str],
    timeout: int = 30000,
) -> dict:
    """Crawl a single domain through the full pipeline."""
    log = get_logger("crawler", client_id=str(client_id), domain=domain)
    start_time = time.time()
    blacklist = BlacklistService(email_patterns, blocked_domains)

    result = {"domain": domain, "status": "failed", "emails": [], "social_links": [], "platform": None, "method": "none", "processing_time_ms": 0, "has_cloudflare": False}

    try:
        # Step 1: Normalize
        normalized = normalize_domain(domain)
        if not normalized:
            async with pool.acquire() as conn:
                await DomainRepository(conn).update_status(client_id, domain, "failed", error_code="INVALID_DOMAIN", error_message="Invalid domain format")
            return result

        # Step 2: Blacklist check
        if not blacklist.filter_domain(normalized):
            async with pool.acquire() as conn:
                await DomainRepository(conn).update_status(client_id, domain, "skipped", error_code="BLACKLISTED")
            result["status"] = "skipped"
            return result

        # Step 3: Validate
        log.info("Step 3: Validating domain...")
        validation = await validate_domain(normalized, timeout=timeout // 1000, client=str(client_id))
        if not validation.is_valid and not validation.is_bot_protected:
            async with pool.acquire() as conn:
                await DomainRepository(conn).update_status(client_id, domain, "failed", error_code="NOT_ACCESSIBLE", error_message=validation.error, has_cloudflare=validation.has_cloudflare)
            result["has_cloudflare"] = validation.has_cloudflare
            return result

        result["has_cloudflare"] = validation.has_cloudflare

        # Steps 4-8: Fetch + extract
        all_emails = []
        all_social = []
        email_contexts = {}
        platform_info = PlatformInfo()
        method = "none"

        if not validation.is_bot_protected:
            log.info("Step 4: Fetching HTML via aiohttp")
            html, headers = await _fetch_html(normalized, timeout)
            if html:
                platform_info = detect_platform(html, headers)
                emails, social_links, contexts = extract_emails_from_html(html, normalized, str(client_id))
                emails = blacklist.filter_emails(emails)
                all_emails.extend(emails)
                all_social.extend(social_links)
                email_contexts.update(contexts)
                method = "dom"

                contact_urls = extract_contact_pages(html, normalized)
                for url in contact_urls[:3]:
                    try:
                        sub_html, _ = await _fetch_html_url(url, timeout)
                        if sub_html:
                            sub_emails, sub_social, sub_contexts = extract_emails_from_html(sub_html, normalized, str(client_id))
                            sub_emails = blacklist.filter_emails(sub_emails)
                            for e in sub_emails:
                                if e not in all_emails:
                                    all_emails.append(e)
                                    email_contexts[e] = sub_contexts.get(e, "")
                            for s in sub_social:
                                if not any(x["url"] == s["url"] for x in all_social):
                                    all_social.append(s)
                    except Exception as e:
                        log.warning(f"Error crawling contact page {url}: {str(e)[:150]}")

        # Step 7: Playwright fallback
        if len(all_emails) == 0:
            log.info("Step 7: Playwright fallback...")
            try:
                pw_emails, pw_social, pw_contexts = await _playwright_scrape(normalized, timeout, str(client_id))
                pw_emails = blacklist.filter_emails(pw_emails)
                all_emails.extend(pw_emails)
                all_social.extend(pw_social)
                email_contexts.update(pw_contexts)
                if pw_emails:
                    method = "playwright"
            except Exception as e:
                log.warning(f"Playwright error ({type(e).__name__}): {str(e)[:200]}")

        # Step 9: Save to DB
        processing_time = int((time.time() - start_time) * 1000)
        status = "completed"

        async with pool.acquire() as conn:
            domain_repo = DomainRepository(conn)
            await domain_repo.update_status(client_id, domain, status=status, platform=platform_info.name, method=method, processing_time_ms=processing_time, has_cloudflare=result["has_cloudflare"])
            domain_record = await domain_repo.get_by_domain(client_id, domain)
            if domain_record:
                domain_id = domain_record["id"]
                email_repo = EmailRepository(conn)
                social_repo = SocialLinkRepository(conn)
                for email in all_emails:
                    await email_repo.insert(domain_id=domain_id, email=email, source="page_crawl", html_context=email_contexts.get(email, ""))
                for social in all_social:
                    await social_repo.insert(domain_id=domain_id, platform=social["platform"], url=social["url"], source=social.get("source", "page_crawl"))

        result.update({"status": status, "emails": all_emails, "social_links": all_social, "platform": platform_info.name, "method": method, "processing_time_ms": processing_time})

        emoji = "✓" if all_emails else "✗"
        log.info(f"{emoji} {domain}: {len(all_emails)} emails, {len(all_social)} social ({processing_time}ms)")

        await broadcaster.broadcast(str(client_id), {"type": "domain_result", "data": {"domain": domain, "status": status, "emails_found": len(all_emails), "social_links_found": len(all_social), "contacts_found": 0, "processing_time_ms": processing_time, "platform": platform_info.name}})
        return result

    except Exception as e:
        processing_time = int((time.time() - start_time) * 1000)
        log.error(f"Error: {str(e)[:200]}")
        async with pool.acquire() as conn:
            await DomainRepository(conn).update_status(client_id, domain, "failed", error_code="EXCEPTION", error_message=str(e)[:500], processing_time_ms=processing_time)
        result["processing_time_ms"] = processing_time
        return result


async def _fetch_html(domain: str, timeout: int = 30000) -> tuple[Optional[str], dict]:
    url = f"https://{domain}"
    headers = {"User-Agent": ua_rotator.get_random(), "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "Accept-Language": "en-US,en;q=0.9,tr;q=0.8", "Accept-Encoding": "gzip, deflate, br", "Connection": "keep-alive"}
    proxy = proxy_rotator.get_next() if proxy_rotator.enabled else None
    try:
        async with aiohttp.ClientSession(connector=aiohttp.TCPConnector(ssl=False), timeout=aiohttp.ClientTimeout(total=timeout / 1000)) as session:
            async with session.get(url, headers=headers, allow_redirects=True, proxy=proxy) as resp:
                if resp.status < 400:
                    return await resp.text(errors="replace"), dict(resp.headers)
    except Exception:
        try:
            async with aiohttp.ClientSession(connector=aiohttp.TCPConnector(ssl=False), timeout=aiohttp.ClientTimeout(total=timeout / 1000)) as session:
                async with session.get(f"http://{domain}", headers=headers, allow_redirects=True, proxy=proxy) as resp:
                    if resp.status < 400:
                        return await resp.text(errors="replace"), dict(resp.headers)
        except Exception:
            pass
    return None, {}


async def _fetch_html_url(url: str, timeout: int = 30000) -> tuple[Optional[str], dict]:
    try:
        async with aiohttp.ClientSession(connector=aiohttp.TCPConnector(ssl=False), timeout=aiohttp.ClientTimeout(total=timeout / 1000)) as session:
            async with session.get(url, headers={"User-Agent": ua_rotator.get_random()}, allow_redirects=True) as resp:
                if resp.status < 400:
                    return await resp.text(errors="replace"), dict(resp.headers)
    except Exception:
        pass
    return None, {}


async def _playwright_scrape(domain: str, timeout: int = 60000, client: str = "") -> tuple[list[str], list[dict], dict[str, str]]:
    url = f"https://{domain}"
    emails = []
    social_links = []
    contexts = {}
    html = await browser_pool.scrape_page(url, timeout=timeout)
    if not html:
        return emails, social_links, contexts
    emails, social_links, contexts = extract_emails_from_html(html, domain, client)
    contact_urls = extract_contact_pages(html, domain)
    if contact_urls:
        results = await browser_pool.scrape_pages(contact_urls[:2], timeout=30000)
        for contact_url, sub_html in results:
            if not sub_html:
                continue
            sub_emails, sub_social, sub_contexts = extract_emails_from_html(sub_html, domain, client)
            for e in sub_emails:
                if e not in emails:
                    emails.append(e)
                    contexts[e] = sub_contexts.get(e, "")
            for s in sub_social:
                if not any(x["url"] == s["url"] for x in social_links):
                    social_links.append(s)
    return emails, social_links, contexts
