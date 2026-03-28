"""WHOIS and phone number analysis module."""

import asyncio
from typing import Optional

import whois
import phonenumbers

from backend.utils.logger import get_logger

log = get_logger("whois_phone")


async def lookup_whois(domain: str, client: str = "") -> dict:
    """Perform WHOIS lookup for a domain.

    Returns dict with registrant info, dates, name servers.
    """
    log_ctx = get_logger("whois_phone", client=client, domain=domain)

    try:
        loop = asyncio.get_event_loop()
        w = await loop.run_in_executor(None, lambda: whois.whois(domain))

        result = {
            "domain": domain,
            "registrant_name": _safe_str(w.get("name")),
            "registrant_org": _safe_str(w.get("org")),
            "registrant_email": _safe_str(w.get("emails")),
            "registrar": _safe_str(w.get("registrar")),
            "creation_date": _safe_date(w.get("creation_date")),
            "expiration_date": _safe_date(w.get("expiration_date")),
            "name_servers": _safe_list(w.get("name_servers")),
        }

        log_ctx.info(f"WHOIS: registrar={result['registrar']}, org={result['registrant_org']}")
        return result

    except Exception as e:
        log_ctx.warning(f"WHOIS lookup failed: {str(e)[:100]}")
        return {"domain": domain, "error": str(e)[:200]}


def analyze_phone_number(
    number: str,
    default_region: str = "TR",
) -> dict:
    """Analyze a phone number using Google's phonenumbers library.

    Returns dict with country, carrier, type, formatted number.
    """
    try:
        parsed = phonenumbers.parse(number, default_region)
        return {
            "original": number,
            "is_valid": phonenumbers.is_valid_number(parsed),
            "country_code": parsed.country_code,
            "national_number": str(parsed.national_number),
            "formatted_international": phonenumbers.format_number(
                parsed, phonenumbers.PhoneNumberFormat.INTERNATIONAL
            ),
            "formatted_national": phonenumbers.format_number(
                parsed, phonenumbers.PhoneNumberFormat.NATIONAL
            ),
            "number_type": _number_type_str(phonenumbers.number_type(parsed)),
            "region": phonenumbers.region_code_for_number(parsed),
        }
    except Exception as e:
        return {
            "original": number,
            "is_valid": False,
            "error": str(e)[:200],
        }


def _safe_str(value) -> Optional[str]:
    """Safely convert WHOIS value to string."""
    if value is None:
        return None
    if isinstance(value, list):
        return str(value[0]) if value else None
    return str(value)


def _safe_date(value) -> Optional[str]:
    """Safely convert WHOIS date to ISO string."""
    if value is None:
        return None
    if isinstance(value, list):
        value = value[0] if value else None
    if value is None:
        return None
    try:
        return value.isoformat()
    except Exception:
        return str(value)


def _safe_list(value) -> list[str]:
    """Safely convert to list of strings."""
    if value is None:
        return []
    if isinstance(value, str):
        return [value.lower()]
    if isinstance(value, (list, tuple)):
        return [str(v).lower() for v in value]
    return []


def _number_type_str(num_type: int) -> str:
    """Convert phonenumber type to readable string."""
    type_map = {
        0: "FIXED_LINE",
        1: "MOBILE",
        2: "FIXED_LINE_OR_MOBILE",
        3: "TOLL_FREE",
        4: "PREMIUM_RATE",
        5: "SHARED_COST",
        6: "VOIP",
        7: "PERSONAL_NUMBER",
        8: "PAGER",
        9: "UAN",
        10: "VOICEMAIL",
    }
    return type_map.get(num_type, "UNKNOWN")
