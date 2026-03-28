"""Async job orchestration with start/pause/resume/stop capability."""

import asyncio
import time
from typing import Optional
import asyncpg

from backend.db.repositories import DomainRepository, JobRepository, BlacklistRepository
from backend.modules.website_crawler import crawl_domain
from backend.services.domain_normalizer import deduplicate_domains
from backend.utils.logger import get_logger
from backend.utils.ws_broadcaster import broadcaster


class TaskManager:
    def __init__(self, client_id: int):
        self.client_id = client_id
        self._running = False
        self._paused = asyncio.Event()
        self._paused.set()
        self._cancel_event = asyncio.Event()
        self._task: Optional[asyncio.Task] = None
        self._job_id: Optional[int] = None
        self._stats = {"total": 0, "processed": 0, "successful": 0, "failed": 0, "pending": 0, "current_domain": ""}
        self._start_time: float = 0
        self._log = get_logger("task_manager", client_id=str(client_id))

    @property
    def is_running(self) -> bool:
        return self._running

    @property
    def is_paused(self) -> bool:
        return not self._paused.is_set()

    @property
    def stats(self) -> dict:
        elapsed = time.time() - self._start_time if self._start_time else 0
        remaining = 0
        if self._stats["processed"] > 0 and self._stats["pending"] > 0:
            remaining = (elapsed / self._stats["processed"]) * self._stats["pending"]
        return {**self._stats, "elapsed_seconds": int(elapsed), "estimated_remaining_seconds": int(remaining)}

    async def start(self, pool: asyncpg.Pool, domains: list[str], concurrency: int = 3, delay_ms: int = 3000, timeout_ms: int = 30000) -> dict:
        if self._running:
            return {"error": "Already running"}

        raw_count = len(domains)
        domains = deduplicate_domains(domains)
        dedup_count = len(domains)
        if not domains:
            return {"error": "No valid domains to process"}

        async with pool.acquire() as conn:
            domain_repo = DomainRepository(conn)
            job_repo = JobRepository(conn)
            # Reset stuck domains
            await conn.execute("UPDATE domains SET status='pending', updated_at=NOW() WHERE client_id=$1 AND status='processing'", self.client_id)
            inserted = await domain_repo.bulk_insert_pending(self.client_id, domains)
            self._job_id = await job_repo.create(self.client_id, "crawler", dedup_count, {"concurrency": concurrency, "delay_ms": delay_ms})

        self._log.info(f"Starting job {self._job_id}: {dedup_count} domains, concurrency={concurrency}")
        self._running = True
        self._cancel_event.clear()
        self._paused.set()
        self._start_time = time.time()
        self._stats = {"total": dedup_count, "processed": 0, "successful": 0, "failed": 0, "pending": dedup_count, "current_domain": ""}
        self._task = asyncio.create_task(self._process_all(pool, domains, concurrency, delay_ms, timeout_ms))
        return {"job_id": self._job_id, "total": dedup_count}

    async def _process_all(self, pool: asyncpg.Pool, domains: list[str], concurrency: int, delay_ms: int, timeout_ms: int):
        semaphore = asyncio.Semaphore(concurrency)

        # Pre-fetch blacklists
        async with pool.acquire() as conn:
            bl_repo = BlacklistRepository(conn)
            email_patterns = await bl_repo.get_email_patterns(self.client_id)
            blocked_domains = await bl_repo.get_blocked_domains(self.client_id)

        async def process_one(domain: str):
            async with semaphore:
                if self._cancel_event.is_set():
                    return
                await self._paused.wait()
                if self._cancel_event.is_set():
                    return

                self._stats["current_domain"] = domain
                self._log.info(f"Starting crawl: {domain} ({self._stats['processed']+1}/{self._stats['total']})")

                async with pool.acquire() as conn:
                    await DomainRepository(conn).update_status(self.client_id, domain, "processing")

                try:
                    result = await crawl_domain(
                        domain=domain, pool=pool, client_id=self.client_id,
                        email_patterns=email_patterns, blocked_domains=blocked_domains,
                        timeout=timeout_ms,
                    )
                except Exception as e:
                    self._log.error(f"Exception crawling {domain}: {e}", exc_info=True)
                    result = {"status": "failed", "emails": []}
                    async with pool.acquire() as conn:
                        await DomainRepository(conn).update_status(self.client_id, domain, "failed")

                self._stats["processed"] += 1
                self._stats["pending"] -= 1
                if result["status"] in ("failed", "skipped"):
                    self._stats["failed"] += 1
                else:
                    self._stats["successful"] += 1

                async with pool.acquire() as conn:
                    await JobRepository(conn).update(self._job_id, processed_items=self._stats["processed"], successful_items=self._stats["successful"], failed_items=self._stats["failed"])

                await self._broadcast_progress()
                if delay_ms > 0:
                    await asyncio.sleep(delay_ms / 1000)

        await asyncio.gather(*[process_one(d) for d in domains], return_exceptions=True)

        self._running = False
        self._stats["current_domain"] = ""
        async with pool.acquire() as conn:
            await JobRepository(conn).update(self._job_id, status="completed")

        self._log.info(f"Job {self._job_id} complete: {self._stats['successful']} success, {self._stats['failed']} failed")
        await broadcaster.broadcast(str(self.client_id), {"type": "notification", "data": {"level": "info", "title": "Processing Complete", "message": f"{self._stats['total']} domains processed. {self._stats['successful']} successful."}})

    async def pause(self) -> dict:
        if not self._running:
            return {"error": "Not running"}
        self._paused.clear()
        await self._broadcast_progress()
        return {"status": "paused"}

    async def resume(self) -> dict:
        if not self._running:
            return {"error": "Not running"}
        self._paused.set()
        await self._broadcast_progress()
        return {"status": "running"}

    async def stop(self) -> dict:
        if not self._running:
            return {"error": "Not running"}
        self._cancel_event.set()
        self._paused.set()
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        self._running = False
        self._stats["current_domain"] = ""
        await self._broadcast_progress()
        return {"status": "stopped"}

    async def _broadcast_progress(self):
        status = "completed" if not self._running else ("paused" if self.is_paused else "running")
        await broadcaster.broadcast(str(self.client_id), {"type": "progress", "data": {"job_id": self._job_id, "job_type": "crawler", "status": status, **self.stats}})


_task_managers: dict[int, TaskManager] = {}


def get_task_manager(client_id: int) -> TaskManager:
    if client_id not in _task_managers:
        _task_managers[client_id] = TaskManager(client_id)
    return _task_managers[client_id]
