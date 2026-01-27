"""
AI Lens Creation Workshop - Main Entry Point
"""
import os
import sys
from pathlib import Path

import webview
from loguru import logger

from api import Api
from services.file_server import LocalFileServer

# Environment
DEV = os.environ.get("DEV") == "1"
APP_NAME = "荷塘AI - 视频创作工坊"

# Paths
if getattr(sys, "frozen", False):
    # Running as packaged app
    BASE_DIR = Path(sys._MEIPASS) if hasattr(sys, "_MEIPASS") else Path(sys.executable).parent
    USER_DATA_DIR = Path.home() / "Documents" / APP_NAME
else:
    # Running in development
    BASE_DIR = Path(__file__).parent
    USER_DATA_DIR = BASE_DIR

# Ensure directories exist
LOGS_DIR = USER_DATA_DIR / "logs"
OUTPUT_DIR = USER_DATA_DIR / "output"
LOGS_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Configure logging
logger.remove()
logger.add(
    sys.stderr,
    format="<green>{time:HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan> - <level>{message}</level>",
    level="DEBUG" if DEV else "INFO",
)
logger.add(
    LOGS_DIR / "app_{time:YYYY-MM-DD}.log",
    format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function}:{line} - {message}",
    rotation="00:00",
    retention="7 days",
    level="DEBUG",
)


def main():
    logger.info(f"Starting {APP_NAME}, DEV={DEV}")
    logger.info(f"Base directory: {BASE_DIR}")
    logger.info(f"User data directory: {USER_DATA_DIR}")

    # Start local file server
    file_server = LocalFileServer(port=8765, base_dir=str(BASE_DIR))
    file_server.start()

    api = Api(user_data_dir=USER_DATA_DIR, output_dir=OUTPUT_DIR)

    if DEV:
        url = "http://localhost:5173"
        logger.info(f"Development mode: loading {url}")
    else:
        url = str(BASE_DIR / "web" / "index.html")
        logger.info(f"Production mode: loading {url}")

    window = webview.create_window(
        title=APP_NAME,
        url=url,
        js_api=api,
        width=1400,
        height=900,
        min_size=(1200, 700),
    )

    # Store window reference in api for dialogs (NOT in Api class directly per CLAUDE.md)
    api.set_window(window)

    webview.start(gui='qt')
    # webview.start()

    # Cleanup
    file_server.stop()
    logger.info("Application closed")


if __name__ == "__main__":
    main()
