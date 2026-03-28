"""Loguru-based logging with WebSocket broadcasting."""

import sys
from pathlib import Path
from loguru import logger
from backend.config import DATA_DIR

# Remove default handler
logger.remove()

# Console handler
logger.add(
    sys.stderr,
    format="<green>{time:HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{extra[module]: <16}</cyan> | {message}",
    level="DEBUG",
    colorize=True,
)

# File handler
LOG_DIR = DATA_DIR / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

logger.add(
    str(LOG_DIR / "{time:YYYY-MM-DD}.log"),
    format="{time:YYYY-MM-DD HH:mm:ss.SSS} | {level: <8} | {extra[module]: <16} | {message}",
    level="DEBUG",
    rotation="00:00",
    retention="30 days",
    encoding="utf-8",
)

# WebSocket broadcast callback
_ws_callback = None


def set_ws_callback(callback):
    global _ws_callback
    _ws_callback = callback


def _ws_sink(message):
    if _ws_callback is None:
        return
    record = message.record
    _ws_callback({
        "type": "log",
        "data": {
            "timestamp": record["time"].isoformat(),
            "level": record["level"].name,
            "module": record["extra"].get("module", "system"),
            "domain": record["extra"].get("domain", ""),
            "message": record["message"],
            "client_id": record["extra"].get("client_id", ""),
        }
    })


logger.add(_ws_sink, format="{message}", level="INFO")


def get_logger(module: str, client_id: str = "", domain: str = ""):
    return logger.bind(module=module, client_id=client_id, domain=domain)
