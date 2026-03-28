"""Proxy and User-Agent rotation."""

import random
from typing import Optional

from fake_useragent import UserAgent


class UserAgentRotator:
    """Rotate user agents for HTTP requests."""

    def __init__(self):
        try:
            self._ua = UserAgent()
        except Exception:
            self._ua = None

        # Fallback user agents
        self._fallback = [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        ]

    def get_random(self) -> str:
        """Get a random user agent string."""
        if self._ua:
            try:
                return self._ua.random
            except Exception:
                pass
        return random.choice(self._fallback)

    def get_chrome(self) -> str:
        """Get a Chrome-like user agent."""
        if self._ua:
            try:
                return self._ua.chrome
            except Exception:
                pass
        return self._fallback[0]


class ProxyRotator:
    """Rotate proxies in round-robin fashion."""

    def __init__(self, proxy_list: Optional[list[str]] = None):
        self._proxies = proxy_list or []
        self._index = 0

    @property
    def enabled(self) -> bool:
        return len(self._proxies) > 0

    def get_next(self) -> Optional[str]:
        """Get the next proxy URL in rotation."""
        if not self._proxies:
            return None
        proxy = self._proxies[self._index % len(self._proxies)]
        self._index += 1
        return proxy

    def get_random(self) -> Optional[str]:
        """Get a random proxy URL."""
        if not self._proxies:
            return None
        return random.choice(self._proxies)

    def update_list(self, proxies: list[str]) -> None:
        """Update the proxy list."""
        self._proxies = [p.strip() for p in proxies if p.strip()]
        self._index = 0


# Singletons
ua_rotator = UserAgentRotator()
proxy_rotator = ProxyRotator()
