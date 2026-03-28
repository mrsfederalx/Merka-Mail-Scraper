"""CMS/Platform detection from HTTP headers and HTML."""

import json
import re
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional

from bs4 import BeautifulSoup

from backend.config import CONFIG_DIR
from backend.utils.logger import get_logger

log = get_logger("platform_detector")


@dataclass
class PlatformInfo:
    name: str = "Unknown"
    confidence: float = 0.0
    has_cloudflare: bool = False
    indicators: list[str] = field(default_factory=list)


def _load_platform_patterns() -> list[dict]:
    """Load platform detection patterns from config."""
    path = CONFIG_DIR / "platform-patterns.json"
    if path.exists():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            patterns = data.get("platforms", [])
            log.debug(f"Loaded {len(patterns)} platform patterns from {path}")
            return patterns
        except Exception as e:
            log.warning(f"Failed to load platform patterns: {e}")
    else:
        log.debug("No platform-patterns.json found, using empty patterns")
    return []


def detect_platform(
    html: str,
    headers: Optional[dict] = None,
) -> PlatformInfo:
    """Detect the platform/CMS from HTML content and headers.

    Checks for Shopify, WordPress, WooCommerce, Wix, etc.
    """
    headers = headers or {}
    patterns = _load_platform_patterns()

    best_match = PlatformInfo()
    header_lower = {k.lower(): v.lower() for k, v in headers.items()}
    html_lower = html[:50000].lower()  # Only check first 50K chars

    # Check Cloudflare
    cf_headers = {"cf-ray", "cf-cache-status", "cf-request-id", "server"}
    for h in cf_headers:
        if h in header_lower:
            if h == "server" and "cloudflare" in header_lower.get("server", ""):
                best_match.has_cloudflare = True
            elif h != "server":
                best_match.has_cloudflare = True

    soup = BeautifulSoup(html[:50000], "lxml")

    for platform in patterns:
        score = 0.0
        indicators = []
        sigs = platform.get("signatures", {})

        # Check headers
        for header_name in sigs.get("headers", []):
            if header_name.lower() in header_lower:
                score += 0.3
                indicators.append(f"header:{header_name}")

        # Check meta tags
        for meta_tag in sigs.get("meta_tags", []):
            meta_lower = meta_tag.lower()
            # Check generator meta tag
            gen = soup.find("meta", attrs={"name": "generator"})
            if gen and meta_lower in str(gen.get("content", "")).lower():
                score += 0.3
                indicators.append(f"meta:{meta_tag}")
            # Also check full HTML
            if meta_lower in html_lower:
                score += 0.1
                indicators.append(f"html:{meta_tag}")

        # Check scripts
        for script_pattern in sigs.get("scripts", []):
            if script_pattern.lower() in html_lower:
                score += 0.2
                indicators.append(f"script:{script_pattern}")

        # Check DOM elements
        for dom_selector in sigs.get("dom_elements", []):
            try:
                if soup.select_one(dom_selector):
                    score += 0.2
                    indicators.append(f"dom:{dom_selector}")
            except Exception:
                pass

        # Normalize score
        score = min(score, 1.0)

        if score > best_match.confidence:
            best_match = PlatformInfo(
                name=platform.get("name", "Unknown"),
                confidence=score,
                has_cloudflare=best_match.has_cloudflare,
                indicators=indicators,
            )

    # If no platform detected with good confidence, mark as Generic
    if best_match.confidence < 0.2:
        best_match.name = "Generic HTML"
        best_match.confidence = 0.5

    log.debug(f"Platform detected: {best_match.name} (confidence: {best_match.confidence:.2f}, cloudflare: {best_match.has_cloudflare})")
    return best_match
