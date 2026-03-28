"""Social media finder module — footer scraping + dorking."""

import asyncio
import re
from typing import Optional

from duckduckgo_search import DDGS

from backend.utils.logger import get_logger

log = get_logger("social_media_finder")

SOCIAL_PLATFORMS = {
    "facebook": {
        "patterns": [
            re.compile(r'(?:https?://)?(?:www\.)?facebook\.com/[^\s"\'<>/?#]+', re.I),
            re.compile(r'(?:https?://)?(?:www\.)?fb\.com/[^\s"\'<>/?#]+', re.I),
        ],
        "dork": 'site:facebook.com "{company}"',
    },
    "instagram": {
        "patterns": [
            re.compile(r'(?:https?://)?(?:www\.)?instagram\.com/[^\s"\'<>/?#]+', re.I),
        ],
        "dork": 'site:instagram.com "{company}"',
    },
    "twitter": {
        "patterns": [
            re.compile(r'(?:https?://)?(?:www\.)?(?:twitter|x)\.com/[^\s"\'<>/?#]+', re.I),
        ],
        "dork": 'site:twitter.com "{company}" OR site:x.com "{company}"',
    },
    "youtube": {
        "patterns": [
            re.compile(r'(?:https?://)?(?:www\.)?youtube\.com/(?:@|channel/|c/)[^\s"\'<>/?#]+', re.I),
        ],
        "dork": 'site:youtube.com "{company}"',
    },
    "linkedin": {
        "patterns": [
            re.compile(r'(?:https?://)?(?:www\.)?linkedin\.com/company/[^\s"\'<>/?#]+', re.I),
        ],
        "dork": 'site:linkedin.com/company "{company}"',
    },
}


async def search_social_profiles(
    company: str,
    domain: Optional[str] = None,
    platforms: Optional[list[str]] = None,
    client: str = "",
) -> list[dict]:
    """Search for social media profiles via DuckDuckGo dorking."""
    log_ctx = get_logger("social_media_finder", client=client, domain=domain or company)
    results = []

    if platforms is None:
        platforms = list(SOCIAL_PLATFORMS.keys())

    for platform in platforms:
        if platform not in SOCIAL_PLATFORMS:
            continue

        config = SOCIAL_PLATFORMS[platform]
        query = config["dork"].format(company=company)

        try:
            loop = asyncio.get_event_loop()
            search_results = await loop.run_in_executor(
                None,
                lambda q=query: list(DDGS().text(q, max_results=5)),
            )

            for sr in search_results:
                url = sr.get("href", "")
                for pattern in config["patterns"]:
                    match = pattern.search(url)
                    if match:
                        clean_url = match.group(0)
                        if not clean_url.startswith("http"):
                            clean_url = "https://" + clean_url

                        if not any(r["url"] == clean_url for r in results):
                            results.append({
                                "platform": platform,
                                "url": clean_url,
                                "source": "dork",
                            })
                        break

            await asyncio.sleep(3)  # Rate limit

        except Exception as e:
            log_ctx.warning(f"Social search error for {platform}: {str(e)[:100]}")

    log_ctx.info(f"Found {len(results)} social profiles")
    return results
