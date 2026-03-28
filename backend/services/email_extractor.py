"""HTML-based email extraction using BeautifulSoup and CSS selectors."""

import json
import re
from pathlib import Path
from typing import Optional

from bs4 import BeautifulSoup

from backend.config import CONFIG_DIR
from backend.services.email_validator import clean_email, is_valid_email, EMAIL_REGEX
from backend.utils.logger import get_logger

log = get_logger("email_extractor")

# Social media link patterns
SOCIAL_PATTERNS = {
    'facebook': re.compile(r'(?:facebook\.com|fb\.com)/[^\s"\'<>]+', re.I),
    'instagram': re.compile(r'instagram\.com/[^\s"\'<>]+', re.I),
    'twitter': re.compile(r'(?:twitter\.com|x\.com)/[^\s"\'<>]+', re.I),
    'youtube': re.compile(r'youtube\.com/[^\s"\'<>]+', re.I),
    'linkedin': re.compile(r'linkedin\.com/(?:company|in)/[^\s"\'<>]+', re.I),
}


def _load_selectors() -> list[dict]:
    """Load email CSS selectors from config."""
    path = CONFIG_DIR / "email-selectors.json"
    if path.exists():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            selectors = sorted(data, key=lambda x: x.get("priority", 0), reverse=True)
            log.debug("Loaded %d email selectors from %s", len(selectors), path)
            return selectors
        except Exception as e:
            log.debug("Failed to load selectors from %s: %s", path, e)
    else:
        log.debug("Selectors config not found at %s, using defaults", path)
    return [{"selector": "a[href^='mailto:']", "priority": 10, "attribute": "href", "extract_pattern": "mailto:(.+)"}]


def extract_emails_from_html(
    html: str,
    domain: str = "",
    client: str = "",
) -> tuple[list[str], list[dict], dict[str, str]]:
    """Extract emails, social links, and HTML context from HTML.

    Returns:
        (emails, social_links, email_contexts)
        - emails: list of valid email strings
        - social_links: list of {platform, url}
        - email_contexts: dict mapping email -> surrounding HTML snippet
    """
    soup = BeautifulSoup(html, "lxml")
    selectors = _load_selectors()

    found_emails: dict[str, str] = {}  # email -> context
    social_links: list[dict] = []

    # 1. CSS selector-based extraction
    css_count = 0
    for sel_config in selectors:
        selector = sel_config.get("selector", "")
        attribute = sel_config.get("attribute")
        pattern = sel_config.get("extract_pattern")

        try:
            elements = soup.select(selector)
            for elem in elements:
                # Get the value
                if attribute:
                    value = elem.get(attribute, "") or ""
                else:
                    value = elem.get_text(strip=True)

                if not value:
                    continue

                # Apply extraction pattern
                if pattern:
                    match = re.search(pattern, str(value))
                    if match:
                        value = match.group(1)

                cleaned = clean_email(value)
                if cleaned and is_valid_email(cleaned) and cleaned not in found_emails:
                    # Get surrounding HTML for context
                    context = _get_context(elem)
                    found_emails[cleaned] = context
                    css_count += 1
        except Exception as e:
            log.debug("[%s] CSS selector '%s' failed: %s", domain, selector, e)
            continue

    log.debug("[%s] CSS selectors found %d emails", domain, css_count)

    # 2. Regex fallback on full text
    text = soup.get_text(separator=" ")
    regex_matches = EMAIL_REGEX.findall(text)
    regex_count = 0
    for raw in regex_matches:
        cleaned = clean_email(raw)
        if cleaned and is_valid_email(cleaned) and cleaned not in found_emails:
            found_emails[cleaned] = ""
            regex_count += 1

    log.debug("[%s] Regex fallback found %d new emails", domain, regex_count)

    # 3. Check mailto links we might have missed
    mailto_count = 0
    for a_tag in soup.find_all("a", href=True):
        href = a_tag["href"]
        if href.startswith("mailto:"):
            email_part = href[7:].split("?")[0]
            cleaned = clean_email(email_part)
            if cleaned and is_valid_email(cleaned) and cleaned not in found_emails:
                context = _get_context(a_tag)
                found_emails[cleaned] = context
                mailto_count += 1

    log.debug("[%s] Mailto scan found %d new emails", domain, mailto_count)

    # 4. Extract social media links
    for a_tag in soup.find_all("a", href=True):
        href = str(a_tag["href"])
        for platform, pattern in SOCIAL_PATTERNS.items():
            match = pattern.search(href)
            if match:
                url = match.group(0)
                if not url.startswith("http"):
                    url = "https://" + url
                # Avoid duplicates
                if not any(sl["url"] == url and sl["platform"] == platform for sl in social_links):
                    social_links.append({
                        "platform": platform,
                        "url": url,
                        "source": "page_crawl",
                    })

    log.debug("[%s] Found %d social links", domain, len(social_links))

    emails = list(found_emails.keys())
    log.info("[%s] Extraction complete: %d emails (css=%d, regex=%d, mailto=%d), %d social links", domain, len(emails), css_count, regex_count, mailto_count, len(social_links))
    return emails, social_links, found_emails


def _get_context(element, max_chars: int = 500) -> str:
    """Get the surrounding HTML context of an element."""
    try:
        # Try parent
        parent = element.parent
        if parent:
            text = parent.get_text(separator=" ", strip=True)
            return text[:max_chars]
    except Exception:
        pass
    return ""


def extract_contact_pages(html: str, base_domain: str) -> list[str]:
    """Find contact/about page URLs from HTML."""
    soup = BeautifulSoup(html, "lxml")
    contact_pages = []

    contact_keywords = [
        'contact', 'iletisim', 'hakkimizda', 'about',
        'team', 'ekibimiz', 'bize-ulasin', 'reach-us',
        'kurumsal', 'corporate',
    ]

    for a_tag in soup.find_all("a", href=True):
        href = str(a_tag["href"]).lower()
        text = a_tag.get_text(strip=True).lower()

        for keyword in contact_keywords:
            if keyword in href or keyword in text:
                # Normalize URL
                if href.startswith('/'):
                    href = f"https://{base_domain}{href}"
                elif href.startswith('http'):
                    pass
                else:
                    href = f"https://{base_domain}/{href}"

                if href not in contact_pages:
                    contact_pages.append(href)
                break

    result = contact_pages[:5]  # Max 5 contact pages
    log.info("[%s] Found %d contact pages: %s", base_domain, len(result), result)
    return result
