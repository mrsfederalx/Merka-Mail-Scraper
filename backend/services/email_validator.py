"""Email format validation and cleaning."""

import re
import html
from typing import Optional

# Comprehensive email regex
EMAIL_REGEX = re.compile(
    r'([a-zA-Z0-9][a-zA-Z0-9._%+\-]*@[a-zA-Z0-9][a-zA-Z0-9.\-]*\.[a-zA-Z]{2,})',
    re.IGNORECASE,
)

# Image/file extensions that get caught as false positives
IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp', '.tiff'}

# Known invalid TLDs (numeric)
INVALID_TLD_PATTERN = re.compile(r'\.\d+$')

# NPM/CSS version pattern (e.g., bootstrap@5.0.2, wght@200)
VERSION_PATTERN = re.compile(r'^\w+@\d+[\.\d]*$')

# CSS patterns
CSS_PATTERN = re.compile(r'@(media|import|charset|keyframes|font-face|supports|layer)')


def clean_email(raw: str) -> Optional[str]:
    """Clean a raw email string."""
    if not raw:
        return None

    email = raw.strip().lower()

    # Decode HTML entities
    email = html.unescape(email)

    # Remove mailto: prefix
    if email.startswith('mailto:'):
        email = email[7:]

    # Remove query strings
    if '?' in email:
        email = email.split('?')[0]

    # Remove URL fragments
    if '#' in email:
        email = email.split('#')[0]

    # Remove trailing slashes, dots, commas
    email = email.rstrip('/.,;:')

    # Remove surrounding quotes, brackets
    email = email.strip('"\'<>()[]{}')

    # Remove spaces
    email = email.replace(' ', '')

    return email if email else None


def is_valid_email(email: str) -> bool:
    """Validate an email address format.

    Checks:
    - Basic regex format
    - Min length
    - Not an image file reference
    - Not an NPM/CSS version string
    - Not a numeric TLD
    - Has valid characters
    """
    if not email or len(email) < 6:
        return False

    # Basic regex
    if not EMAIL_REGEX.fullmatch(email):
        return False

    local_part, domain = email.rsplit('@', 1)

    # Check image extensions
    for ext in IMAGE_EXTENSIONS:
        if domain.endswith(ext) or email.endswith(ext):
            return False

    # Check for NPM/CSS version strings
    if VERSION_PATTERN.match(email):
        return False

    # Check for CSS @rules
    if CSS_PATTERN.match(email):
        return False

    # Check numeric TLD
    if INVALID_TLD_PATTERN.search(domain):
        return False

    # Local part checks
    if local_part.startswith('.') or local_part.endswith('.'):
        return False
    if '..' in local_part:
        return False

    # Domain checks
    if domain.startswith('.') or domain.startswith('-'):
        return False
    if '..' in domain:
        return False

    # Min TLD length
    tld = domain.rsplit('.', 1)[-1]
    if len(tld) < 2:
        return False

    return True


def extract_emails_from_text(text: str) -> list[str]:
    """Extract all valid emails from a text string."""
    raw_matches = EMAIL_REGEX.findall(text)
    valid = []
    seen = set()

    for raw in raw_matches:
        cleaned = clean_email(raw)
        if cleaned and is_valid_email(cleaned) and cleaned not in seen:
            seen.add(cleaned)
            valid.append(cleaned)

    return valid
