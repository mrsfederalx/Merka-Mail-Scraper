"""Email discovery module — MX check, pattern generation, SMTP verification."""

import asyncio
import smtplib
import socket
from typing import Optional

import dns.resolver

from backend.utils.logger import get_logger

log = get_logger("email_discoverer")


async def check_mx_records(domain: str) -> list[str]:
    """Check MX records for a domain. Returns list of MX servers."""
    try:
        loop = asyncio.get_event_loop()
        answers = await loop.run_in_executor(
            None, lambda: dns.resolver.resolve(domain, "MX")
        )
        mx_servers = sorted(
            [(r.preference, str(r.exchange).rstrip(".")) for r in answers],
            key=lambda x: x[0],
        )
        return [mx for _, mx in mx_servers]
    except Exception as e:
        log.debug(f"MX check failed for {domain}: {e}")
        return []


def generate_email_patterns(
    first_name: str,
    last_name: str,
    domain: str,
    max_patterns: int = 8,
) -> list[str]:
    """Generate possible email patterns from a name.

    Common patterns:
    - first.last@domain
    - f.last@domain
    - first@domain
    - firstlast@domain
    - first_last@domain
    - flast@domain
    - lastf@domain
    - last@domain
    """
    first = first_name.lower().strip()
    last = last_name.lower().strip()

    if not first or not last:
        return []

    f = first[0]  # First initial

    patterns = [
        f"{first}.{last}@{domain}",
        f"{f}.{last}@{domain}",
        f"{first}@{domain}",
        f"{first}{last}@{domain}",
        f"{first}_{last}@{domain}",
        f"{f}{last}@{domain}",
        f"{last}{f}@{domain}",
        f"{last}@{domain}",
        f"{first}-{last}@{domain}",
        f"{last}.{first}@{domain}",
    ]

    return patterns[:max_patterns]


async def verify_smtp(
    email: str,
    timeout: int = 10,
) -> dict:
    """Verify email via SMTP RCPT TO.

    Returns:
        {
            'email': str,
            'valid': bool,
            'catch_all': bool,
            'mx_server': str,
            'error': str or None,
        }
    """
    domain = email.split("@")[1]
    result = {
        "email": email,
        "valid": False,
        "catch_all": False,
        "mx_server": "",
        "error": None,
    }

    # Get MX server
    mx_servers = await check_mx_records(domain)
    if not mx_servers:
        result["error"] = "No MX records"
        return result

    mx_server = mx_servers[0]
    result["mx_server"] = mx_server

    try:
        loop = asyncio.get_event_loop()
        verification = await loop.run_in_executor(
            None, lambda: _smtp_check(email, mx_server, timeout)
        )
        result.update(verification)
    except Exception as e:
        result["error"] = str(e)[:200]

    return result


def _smtp_check(email: str, mx_server: str, timeout: int) -> dict:
    """Synchronous SMTP verification."""
    result = {"valid": False, "catch_all": False, "error": None}

    try:
        smtp = smtplib.SMTP(timeout=timeout)
        smtp.connect(mx_server, 25)
        smtp.ehlo_or_helo_if_needed()

        # Try MAIL FROM
        code, _ = smtp.mail("verify@verify.com")
        if code != 250:
            result["error"] = f"MAIL FROM rejected: {code}"
            smtp.quit()
            return result

        # Check target email
        code, message = smtp.rcpt(email)
        if code == 250:
            result["valid"] = True
        elif code == 550:
            result["valid"] = False
        else:
            result["error"] = f"RCPT TO response: {code}"

        # Check for catch-all (test with random email)
        import random
        import string
        random_local = ''.join(random.choices(string.ascii_lowercase, k=20))
        domain = email.split("@")[1]
        random_email = f"{random_local}@{domain}"

        code2, _ = smtp.rcpt(random_email)
        if code2 == 250:
            result["catch_all"] = True

        smtp.quit()

    except socket.timeout:
        result["error"] = "SMTP timeout"
    except smtplib.SMTPConnectError:
        result["error"] = "SMTP connection refused"
    except Exception as e:
        result["error"] = str(e)[:200]

    return result


async def discover_emails(
    domain: str,
    contacts: list[dict],
    timeout: int = 10,
    client: str = "",
) -> list[dict]:
    """Full email discovery pipeline for a domain.

    1. Check MX records
    2. Generate patterns from contact names
    3. SMTP verify each pattern

    Returns list of {email, valid, catch_all, source}
    """
    log_ctx = get_logger("email_discoverer", client=client, domain=domain)

    # Check MX
    mx_servers = await check_mx_records(domain)
    if not mx_servers:
        log_ctx.warning("No MX records — domain doesn't accept email")
        return []

    log_ctx.info(f"MX servers: {', '.join(mx_servers[:3])}")

    # Generate patterns for each contact
    all_emails = []
    for contact in contacts:
        first = contact.get("first_name", "")
        last = contact.get("last_name", "")
        if first and last:
            patterns = generate_email_patterns(first, last, domain)
            log_ctx.info(f"Generated {len(patterns)} patterns for {first} {last}")

            # Verify each pattern
            for email in patterns:
                result = await verify_smtp(email, timeout)
                result["source"] = "pattern_generated"
                result["contact_name"] = f"{first} {last}"
                all_emails.append(result)

                # If we found a valid one, skip rest for this contact
                if result["valid"] and not result["catch_all"]:
                    log_ctx.info(f"Valid email found: {email}")
                    break

    return all_emails
