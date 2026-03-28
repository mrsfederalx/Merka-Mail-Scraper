"""WebSocket connection management and broadcasting."""

import asyncio
from typing import Optional
from fastapi import WebSocket
from backend.utils.logger import set_ws_callback


class WSBroadcaster:
    def __init__(self):
        self._connections: dict[str, list[WebSocket]] = {}
        self._lock = asyncio.Lock()
        set_ws_callback(self._log_callback)

    async def register(self, client_key: str, websocket: WebSocket) -> None:
        async with self._lock:
            if client_key not in self._connections:
                self._connections[client_key] = []
            self._connections[client_key].append(websocket)

    async def unregister(self, client_key: str, websocket: WebSocket) -> None:
        async with self._lock:
            if client_key in self._connections:
                try:
                    self._connections[client_key].remove(websocket)
                except ValueError:
                    pass
                if not self._connections[client_key]:
                    del self._connections[client_key]

    async def broadcast(self, client_key: str, message: dict) -> None:
        if client_key not in self._connections:
            return
        dead = []
        for ws in self._connections.get(client_key, []):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            await self.unregister(client_key, ws)

    def _log_callback(self, message: dict) -> None:
        client_id = str(message.get("data", {}).get("client_id", ""))
        if client_id:
            try:
                loop = asyncio.get_running_loop()
                loop.create_task(self.broadcast(client_id, message))
            except RuntimeError:
                pass

    def get_connection_count(self, client_key: Optional[str] = None) -> int:
        if client_key:
            return len(self._connections.get(client_key, []))
        return sum(len(v) for v in self._connections.values())


broadcaster = WSBroadcaster()
