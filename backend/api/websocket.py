"""WebSocket endpoint."""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from typing import Optional
from backend.utils.ws_broadcaster import broadcaster
from backend.middleware.auth import decode_access_token

router = APIRouter()


@router.websocket("/ws/{client_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    client_id: int,
    token: Optional[str] = Query(None),
):
    """WebSocket with optional token auth."""
    # Validate token if provided
    user_id = None
    if token:
        try:
            payload = decode_access_token(token)
            user_id = payload.get("sub")
        except Exception:
            await websocket.close(code=4001)
            return

    await websocket.accept()
    ws_key = str(client_id)
    await broadcaster.register(ws_key, websocket)

    await websocket.send_json({
        "type": "connected",
        "data": {"client_id": client_id, "server_version": "1.0.0"},
    })

    try:
        while True:
            data = await websocket.receive_json()
            if data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        await broadcaster.unregister(ws_key, websocket)
    except Exception:
        await broadcaster.unregister(ws_key, websocket)
