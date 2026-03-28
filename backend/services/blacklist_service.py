"""Blacklist checking with wildcard pattern support."""

import re
import fnmatch
from backend.utils.logger import get_logger

log = get_logger("blacklist")
KEP_TR_PATTERN = re.compile(r'@.*\.kep.*\.tr$', re.IGNORECASE)


class BlacklistService:
    """Check emails and domains against pre-loaded blacklists."""

    def __init__(self, email_patterns: list[str], blocked_domains: list[str]):
        self._email_patterns = [p.lower().strip() for p in email_patterns]
        self._blocked_domains = [d.lower().strip() for d in blocked_domains]

    def is_email_blocked(self, email: str) -> bool:
        email = email.lower().strip()
        if KEP_TR_PATTERN.match(email):
            return True
        for pattern in self._email_patterns:
            if pattern == email:
                return True
            if '*' in pattern or '?' in pattern:
                if fnmatch.fnmatch(email, pattern):
                    return True
            if pattern.startswith('@') and email.endswith(pattern):
                return True
        return False

    def is_domain_blocked(self, domain: str) -> bool:
        return domain.lower().strip() in self._blocked_domains

    def filter_emails(self, emails: list[str]) -> list[str]:
        result = [e for e in emails if not self.is_email_blocked(e)]
        removed = len(emails) - len(result)
        if removed > 0:
            log.info(f"Blacklist filtered {removed} emails ({len(emails)} -> {len(result)})")
        return result

    def filter_domain(self, domain: str) -> bool:
        return not self.is_domain_blocked(domain)
