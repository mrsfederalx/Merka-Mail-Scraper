"""Playwright browser pool — uses sync API in a thread to bypass event loop limitations."""

import asyncio
import threading
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager

from backend.utils.logger import get_logger
from backend.services.proxy_rotation import ua_rotator

log = get_logger("browser_pool")

_pw_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="playwright")

_sync_pw = None
_sync_browser = None
_pw_lock = threading.Lock()


def _ensure_sync_browser():
    global _sync_pw, _sync_browser
    with _pw_lock:
        if _sync_pw is None:
            from playwright.sync_api import sync_playwright
            _sync_pw = sync_playwright().start()
            log.info("Playwright sync instance started")
        if _sync_browser is None or not _sync_browser.is_connected():
            log.info("Launching Chromium browser (headless=True)")
            _sync_browser = _sync_pw.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-blink-features=AutomationControlled", "--disable-dev-shm-usage", "--disable-gpu"],
            )
    return _sync_browser


def _run_playwright_scrape(url: str, timeout: int, user_agent: str) -> str:
    browser = _ensure_sync_browser()
    context = None
    page = None
    try:
        context = browser.new_context(user_agent=user_agent, viewport={"width": 1366, "height": 768}, java_script_enabled=True, ignore_https_errors=True)
        page = context.new_page()
        try:
            page.route("**/*.{png,jpg,jpeg,gif,svg,webp,ico,woff,woff2,ttf,eot}", lambda route: route.abort())
        except Exception:
            pass
        page.set_default_timeout(timeout)
        page.goto(url, wait_until="domcontentloaded", timeout=timeout)
        page.wait_for_timeout(2000)
        return page.content()
    finally:
        if page:
            try: page.close()
            except: pass
        if context:
            try: context.close()
            except: pass


def _run_playwright_scrape_multi(urls: list[str], timeout: int, user_agent: str) -> list[tuple[str, str]]:
    browser = _ensure_sync_browser()
    results = []
    context = None
    page = None
    try:
        context = browser.new_context(user_agent=user_agent, viewport={"width": 1366, "height": 768}, java_script_enabled=True, ignore_https_errors=True)
        page = context.new_page()
        try:
            page.route("**/*.{png,jpg,jpeg,gif,svg,webp,ico,woff,woff2,ttf,eot}", lambda route: route.abort())
        except Exception:
            pass
        page.set_default_timeout(timeout)
        for url in urls:
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=timeout)
                page.wait_for_timeout(1500)
                results.append((url, page.content()))
            except Exception as e:
                log.warning(f"Playwright: error on {url}: {type(e).__name__}: {str(e)[:100]}")
                results.append((url, ""))
    finally:
        if page:
            try: page.close()
            except: pass
        if context:
            try: context.close()
            except: pass
    return results


def _close_sync_playwright():
    global _sync_pw, _sync_browser
    with _pw_lock:
        if _sync_browser and _sync_browser.is_connected():
            try: _sync_browser.close()
            except Exception as e: log.error(f"Error closing browser: {e}")
            finally: _sync_browser = None
        if _sync_pw:
            try: _sync_pw.stop()
            except Exception as e: log.error(f"Error stopping Playwright: {e}")
            finally: _sync_pw = None


class BrowserPool:
    def __init__(self, max_browsers: int = 3):
        self._semaphore = asyncio.Semaphore(max_browsers)

    async def scrape_page(self, url: str, timeout: int = 60000) -> str:
        await self._semaphore.acquire()
        try:
            loop = asyncio.get_running_loop()
            return await loop.run_in_executor(_pw_executor, _run_playwright_scrape, url, timeout, ua_rotator.get_chrome())
        finally:
            self._semaphore.release()

    async def scrape_pages(self, urls: list[str], timeout: int = 60000) -> list[tuple[str, str]]:
        await self._semaphore.acquire()
        try:
            loop = asyncio.get_running_loop()
            return await loop.run_in_executor(_pw_executor, _run_playwright_scrape_multi, urls, timeout, ua_rotator.get_chrome())
        finally:
            self._semaphore.release()

    async def close(self):
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(_pw_executor, _close_sync_playwright)


browser_pool = BrowserPool()
