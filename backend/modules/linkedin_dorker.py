"""LinkedIn dorker module — find decision-makers via Google SERP scraping with Playwright."""

import asyncio
import re
from typing import Optional
from urllib.parse import urlencode, urlparse

from bs4 import BeautifulSoup

from backend.core.browser_pool import browser_pool
from backend.utils.logger import get_logger

log = get_logger("linkedin_dorker")

# Rate limiter
_rate_lock = asyncio.Lock()

# ===== Turkish character normalization =====

_TR_MAP = str.maketrans({
    "\u0131": "i",  # ı -> i
    "\u015f": "s",  # s -> s
    "\u00e7": "c",  # c -> c
    "\u011f": "g",  # g -> g
    "\u00fc": "u",  # u -> u
    "\u00f6": "o",  # o -> o
    "\u0130": "I",  # I -> I
    "\u015e": "S",  # S -> S
    "\u00c7": "C",  # C -> C
    "\u011e": "G",  # G -> G
    "\u00dc": "U",  # U -> U
    "\u00d6": "O",  # O -> O
})


def normalize_tr(text: str) -> str:
    """Normalize Turkish characters for email pattern generation."""
    return text.translate(_TR_MAP)


# ===== Role definitions (EN + TR) =====

ROLE_SCORES: dict[str, int] = {
    # C-Level / Owner  40 points
    "ceo": 40, "cto": 40, "cfo": 40, "coo": 40, "cmo": 40,
    "owner": 40, "founder": 40, "co-founder": 40, "partner": 40,
    "managing director": 40,
    "genel mudur": 40, "kurucu": 40, "ortak": 40, "patron": 40,
    "sahip": 40, "yonetim kurulu": 40,
    # Director / VP  30 points
    "director": 30, "vp": 30, "vice president": 30,
    "head of": 30, "chief": 30, "president": 30,
    "direktor": 30, "mudur": 30, "baskan": 30,
    "genel mudur yardimcisi": 30,
    # Manager  20 points
    "manager": 20, "lead": 20, "supervisor": 20,
    "yonetici": 20, "sorumlu": 20, "sef": 20, "koordinator": 20,
}

# Default Google search queries (EN + TR hybrid)
DEFAULT_QUERIES = [
    'site:linkedin.com/in "{company}" (CEO OR "Genel Mudur" OR Owner OR Founder OR "Kurucu")',
    'site:linkedin.com/in "{company}" (Director OR "Mudur" OR Manager OR "Yonetici" OR VP)',
    'site:linkedin.com/in "{company}" (CTO OR CFO OR COO OR "Managing Director")',
]


# ===== Google SERP Scraping =====


def _build_google_url(query: str, start: int = 0, num: int = 20) -> str:
    """Build Google search URL."""
    params = urlencode({"q": query, "num": str(num), "start": str(start), "hl": "en"})
    return f"https://www.google.com/search?{params}"


def _parse_google_serp(html: str) -> list[dict]:
    """Parse Google SERP HTML and extract LinkedIn profile results.

    Returns list of {url, title, snippet}
    """
    soup = BeautifulSoup(html, "html.parser")
    results = []

    # Google search result containers
    for g in soup.select("div.g"):
        # Extract URL
        link = g.select_one("a[href]")
        if not link:
            continue
        url = link.get("href", "")

        # Only linkedin.com/in/ profile URLs
        if "linkedin.com/in/" not in url:
            continue

        # Extract title (h3 inside the result)
        h3 = g.select_one("h3")
        title = h3.get_text(strip=True) if h3 else ""

        # Extract snippet text
        snippet_el = (
            g.select_one("[data-sncf]")
            or g.select_one(".VwiC3b")
            or g.select_one('div[style*="-webkit-line-clamp"]')
            or g.select_one(".IsZvec")
        )
        snippet = snippet_el.get_text(strip=True) if snippet_el else ""

        # Clean URL (remove Google redirect wrapper + query params)
        url = _clean_linkedin_url(url)
        if url and title:
            results.append({"url": url, "title": title, "snippet": snippet})

    return results


def _clean_linkedin_url(url: str) -> str:
    """Normalize LinkedIn URL: strip query params and tracking."""
    # Handle Google redirect: /url?q=https://linkedin.com/...
    if "/url?" in url and "q=" in url:
        from urllib.parse import parse_qs, urlparse as _urlparse

        parsed = _urlparse(url)
        qs = parse_qs(parsed.query)
        url = qs.get("q", [url])[0]

    # Strip query params
    url = url.split("?")[0].rstrip("/")

    # Ensure https
    if url.startswith("http://"):
        url = url.replace("http://", "https://", 1)

    return url


def _parse_linkedin_title(title: str) -> dict:
    """Parse LinkedIn result title to extract name and role.

    Formats:
      "Satya Nadella - Chairman and CEO at Microsoft | LinkedIn"
      "Ali Yilmaz | LinkedIn"
      "John Doe - CTO - Company Name | LinkedIn"
    """
    # Remove " | LinkedIn" suffix
    title = re.sub(r"\s*\|\s*LinkedIn\s*$", "", title, flags=re.IGNORECASE).strip()

    # Split by " - "
    parts = [p.strip() for p in title.split(" - ") if p.strip()]

    full_name = parts[0] if parts else ""
    role = " - ".join(parts[1:]) if len(parts) > 1 else ""

    # Split name into first/last
    name_parts = full_name.split()
    first_name = name_parts[0] if name_parts else ""
    last_name = " ".join(name_parts[1:]) if len(name_parts) > 1 else ""

    return {
        "full_name": full_name,
        "first_name": first_name,
        "last_name": last_name,
        "role": role,
    }


def _score_contact(
    full_name: str,
    role: str,
    linkedin_url: str,
    company: str,
    snippet: str = "",
) -> int:
    """Score a contact 0-100. Company match is prioritized."""
    score = 0
    role_lower = normalize_tr(role.lower()) if role else ""
    snippet_lower = normalize_tr(snippet.lower()) if snippet else ""
    company_lower = normalize_tr(company.lower()) if company else ""

    # --- Role matching (max 40) ---
    role_points = 0
    for keyword, points in ROLE_SCORES.items():
        if keyword in role_lower:
            role_points = max(role_points, points)
    score += role_points

    # --- Company match (max 30) --- PRIORITIZED
    if company_lower:
        combined = f"{role_lower} {snippet_lower}"
        if company_lower in combined:
            score += 30  # Exact match
        elif len(company_lower) > 3 and any(
            w in combined for w in company_lower.split() if len(w) > 3
        ):
            score += 15  # Partial word match

    # --- Profile completeness (max 15) ---
    if linkedin_url and "linkedin.com/in/" in linkedin_url:
        score += 8
    name_parts = full_name.split() if full_name else []
    if len(name_parts) >= 2:
        score += 7

    # --- Snippet quality (max 15) ---
    if snippet:
        score += min(len(snippet) // 25, 15)

    return min(score, 100)


async def _google_search_linkedin(
    query: str,
    max_pages: int = 2,
    rate_limit_seconds: float = 8.0,
    client: str = "",
    domain: str = "",
) -> list[dict]:
    """Search Google for LinkedIn profiles using Playwright.

    Returns list of {url, title, snippet, full_name, first_name, last_name, role}
    """
    log_ctx = get_logger("linkedin_dorker", client=client, domain=domain)
    all_results: list[dict] = []
    seen_urls: set[str] = set()

    for page_idx in range(max_pages):
        start = page_idx * 20
        url = _build_google_url(query, start=start, num=20)

        log_ctx.info(f"Google SERP sayfa {page_idx + 1}/{max_pages}: {query[:70]}...")

        try:
            html = await browser_pool.scrape_page(url, timeout=30000)

            if not html:
                log_ctx.warning("Bos SERP yaniti, Google engellemis olabilir")
                break

            # CAPTCHA / block detection
            html_lower = html.lower()
            if "unusual traffic" in html_lower or "captcha" in html_lower:
                log_ctx.warning("Google CAPTCHA/engel tespit edildi, durduruluyor")
                break

            # Parse results
            serp_results = _parse_google_serp(html)
            log_ctx.info(f"Sayfa {page_idx + 1}: {len(serp_results)} LinkedIn profil bulundu")

            if not serp_results:
                break  # No more results

            for r in serp_results:
                if r["url"] in seen_urls:
                    continue
                seen_urls.add(r["url"])

                parsed = _parse_linkedin_title(r["title"])
                parsed["linkedin_url"] = r["url"]
                parsed["snippet"] = r["snippet"]
                all_results.append(parsed)

        except Exception as e:
            log_ctx.warning(f"Google arama hatasi: {str(e)[:120]}")
            break

        # Rate limit between pages
        if page_idx < max_pages - 1:
            await asyncio.sleep(rate_limit_seconds)

    return all_results


# ===== Public API =====


async def search_decision_makers(
    company: str,
    domain: Optional[str] = None,
    roles: Optional[list[str]] = None,
    max_results: int = 20,
    rate_limit_seconds: float = 8.0,
    client: str = "",
) -> list[dict]:
    """Search for decision-makers on LinkedIn via Google dorking with Playwright.

    Returns list of {full_name, first_name, last_name, role, linkedin_url, score, source, search_query}
    """
    log_ctx = get_logger("linkedin_dorker", client=client, domain=domain or company)

    contacts: list[dict] = []
    seen_urls: set[str] = set()

    # Build search queries
    if roles:
        role_query = " OR ".join(f'"{r}"' if " " in r else r for r in roles)
        queries = [f'site:linkedin.com/in "{company}" ({role_query})']
        if domain and domain != company:
            queries.append(f'site:linkedin.com/in "{domain}" ({role_query})')
    else:
        queries = [q.replace("{company}", company) for q in DEFAULT_QUERIES]
        # Also search by domain name if different from company
        if domain and domain.split(".")[0].lower() != company.lower():
            queries.append(
                f'site:linkedin.com/in "{domain}" (CEO OR Owner OR Founder OR Director)'
            )

    for qi, query in enumerate(queries):
        async with _rate_lock:
            log_ctx.info(f"Sorgu {qi + 1}/{len(queries)} baslatiliyor...")

            results = await _google_search_linkedin(
                query=query,
                max_pages=2,
                rate_limit_seconds=rate_limit_seconds,
                client=client,
                domain=domain or company,
            )

            for r in results:
                url = r.get("linkedin_url", "")
                if url in seen_urls:
                    continue
                seen_urls.add(url)

                r["source"] = "google"
                r["search_query"] = query
                r["score"] = _score_contact(
                    r.get("full_name", ""),
                    r.get("role", ""),
                    url,
                    company,
                    r.get("snippet", ""),
                )
                contacts.append(r)

            # Rate limit between different queries
            if qi < len(queries) - 1:
                await asyncio.sleep(rate_limit_seconds)

    # Sort by score descending
    contacts.sort(key=lambda c: c.get("score", 0), reverse=True)

    # Limit results
    contacts = contacts[:max_results]

    log_ctx.info(f"Toplam {len(contacts)} karar verici bulundu")
    return contacts


async def discover_decision_makers(
    domain: str,
    company_name: Optional[str] = None,
    roles: Optional[list[str]] = None,
    max_results: int = 20,
    rate_limit_seconds: float = 8.0,
    smtp_timeout: int = 10,
    client: str = "",
) -> dict:
    """Full decision-maker discovery pipeline:
    1. Google dork -> find LinkedIn profiles
    2. Score and filter contacts
    3. Generate email patterns for each contact
    4. SMTP verify patterns
    5. Return enriched contacts with email + verification

    Returns: {contacts: [...], emails_found: int, emails_verified: int}
    """
    from backend.modules.email_discoverer import (
        generate_email_patterns,
        verify_smtp,
        check_mx_records,
    )

    log_ctx = get_logger("linkedin_dorker", client=client, domain=domain)

    # Derive company name from domain if not given
    if not company_name:
        import tldextract

        ext = tldextract.extract(domain)
        company_name = ext.domain.replace("-", " ").replace("_", " ").title()
        log_ctx.info(f"Sirket adi otomatik turetildi: '{company_name}' ({domain})")

    # Step 1: Google Dorking
    log_ctx.info("Adim 1/3: Google ile LinkedIn profilleri araniyor...")
    contacts = await search_decision_makers(
        company=company_name,
        domain=domain,
        roles=roles,
        max_results=max_results,
        rate_limit_seconds=rate_limit_seconds,
        client=client,
    )

    if not contacts:
        log_ctx.warning("LinkedIn dorking ile hic karar verici bulunamadi")
        return {"contacts": [], "emails_found": 0, "emails_verified": 0}

    log_ctx.info(f"{len(contacts)} karar verici bulundu, email kesfi baslatiliyor...")

    # Step 2: Check MX records
    log_ctx.info("Adim 2/3: MX kayitlari kontrol ediliyor...")
    mx_servers = await check_mx_records(domain)
    if not mx_servers:
        log_ctx.warning(f"{domain} icin MX kaydi bulunamadi, email kesfi atlanacak")
        for c in contacts:
            c.setdefault("email_found", None)
            c.setdefault("email_verified", False)
        return {"contacts": contacts, "emails_found": 0, "emails_verified": 0}

    log_ctx.info(f"MX sunuculari: {', '.join(mx_servers[:3])}")

    # Step 3: Generate & verify email patterns
    log_ctx.info("Adim 3/3: Email pattern uretimi ve SMTP dogrulama...")
    emails_found = 0
    emails_verified = 0

    for contact in contacts:
        first = contact.get("first_name", "")
        last = contact.get("last_name", "")

        contact.setdefault("email_found", None)
        contact.setdefault("email_verified", False)

        if not first or not last:
            continue

        # Normalize Turkish chars for email patterns
        first_norm = normalize_tr(first).lower().strip()
        last_norm = normalize_tr(last).lower().strip()

        # Remove special characters from name parts
        first_norm = re.sub(r"[^a-z]", "", first_norm)
        last_norm = re.sub(r"[^a-z]", "", last_norm)

        if not first_norm or not last_norm:
            continue

        patterns = generate_email_patterns(first_norm, last_norm, domain)
        log_ctx.debug(f"{first} {last} icin {len(patterns)} email pattern uretildi")

        for email_pattern in patterns:
            try:
                result = await verify_smtp(email_pattern, timeout=smtp_timeout)
                if result["valid"] and not result["catch_all"]:
                    contact["email_found"] = email_pattern
                    contact["email_verified"] = True
                    emails_found += 1
                    emails_verified += 1
                    log_ctx.info(f"Dogrulanan email: {email_pattern} ({first} {last})")
                    break
                elif result["valid"] and result["catch_all"]:
                    if not contact["email_found"]:
                        contact["email_found"] = email_pattern
                        contact["email_verified"] = False
                        emails_found += 1
                    break
            except Exception as e:
                log_ctx.debug(f"SMTP hata ({email_pattern}): {e}")

        # If no SMTP result, use first pattern as unverified guess
        if not contact["email_found"] and patterns:
            contact["email_found"] = patterns[0]
            contact["email_verified"] = False
            emails_found += 1

    log_ctx.info(
        f"Pipeline tamamlandi: {len(contacts)} kisi, "
        f"{emails_found} email bulundu, {emails_verified} dogrulandi"
    )

    return {
        "contacts": contacts,
        "emails_found": emails_found,
        "emails_verified": emails_verified,
    }


async def search_company_page(
    company: str,
    client: str = "",
) -> Optional[dict]:
    """Search for a company's LinkedIn page via Google."""
    log_ctx = get_logger("linkedin_dorker", client=client)

    query = f'site:linkedin.com/company "{company}"'
    url = _build_google_url(query, num=5)

    try:
        html = await browser_pool.scrape_page(url, timeout=20000)
        if not html:
            return None

        results = BeautifulSoup(html, "html.parser")
        for g in results.select("div.g"):
            link = g.select_one("a[href]")
            if not link:
                continue
            href = link.get("href", "")
            if "linkedin.com/company/" in href:
                h3 = g.select_one("h3")
                return {
                    "company": company,
                    "linkedin_url": _clean_linkedin_url(href),
                    "title": h3.get_text(strip=True) if h3 else "",
                }
    except Exception as e:
        log_ctx.warning(f"Sirket sayfa arama hatasi: {str(e)[:100]}")

    return None
