"""URL to domain normalization."""

import re
from urllib.parse import urlparse
from typing import Optional

import tldextract

from backend.utils.logger import get_logger

log = get_logger("domain_normalizer")


def normalize_domain(raw: str) -> Optional[str]:
    """Normalize a raw domain/URL string to a clean domain.

    Examples:
        'https://www.example.com/page' -> 'example.com'
        'http://shop.example.co.uk/' -> 'shop.example.co.uk'
        'example.com' -> 'example.com'
        'www.example.com' -> 'example.com'
        'user@example.com' -> 'example.com'
    """
    if not raw or not raw.strip():
        return None

    raw = raw.strip().lower()

    # Remove common garbage
    raw = raw.replace('\t', '').replace('\r', '').replace('\n', '')

    # If it's an email, extract domain
    if '@' in raw and '/' not in raw:
        raw = raw.split('@')[-1]

    # Add scheme if missing for urlparse
    if not raw.startswith(('http://', 'https://')):
        raw = 'http://' + raw

    try:
        parsed = urlparse(raw)
        hostname = parsed.hostname or ''
    except Exception:
        hostname = raw

    # Remove www prefix
    if hostname.startswith('www.'):
        hostname = hostname[4:]

    # Remove trailing dots
    hostname = hostname.rstrip('.')

    # Validate with tldextract
    ext = tldextract.extract(hostname)
    if not ext.domain or not ext.suffix:
        return None

    # Reconstruct: subdomain.domain.suffix (keep subdomains like shop.example.com)
    if ext.subdomain and ext.subdomain != 'www':
        result = f"{ext.subdomain}.{ext.domain}.{ext.suffix}"
    else:
        result = f"{ext.domain}.{ext.suffix}"

    if result != raw.replace('http://', '').replace('https://', '').rstrip('/'):
        log.debug(f"Normalized: '{raw}' -> '{result}'")
    return result


def deduplicate_domains(domains: list[str]) -> list[str]:
    """Normalize and deduplicate a list of domains."""
    seen = set()
    result = []
    invalid_count = 0
    for raw in domains:
        normalized = normalize_domain(raw)
        if normalized and normalized not in seen:
            seen.add(normalized)
            result.append(normalized)
        elif not normalized:
            invalid_count += 1
    dupes = len(domains) - len(result) - invalid_count
    if dupes > 0 or invalid_count > 0:
        log.info(f"Deduplication: {len(domains)} input -> {len(result)} unique ({dupes} duplicates, {invalid_count} invalid)")
    return result
