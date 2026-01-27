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


def check_windows_webview2():
    """Check if WebView2 Runtime is available on Windows"""
    if sys.platform != "win32":
        return True
    
    try:
        import winreg
        # Check if WebView2 Runtime is installed
        key_paths = [
            r"SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
            r"SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
        ]
        for key_path in key_paths:
            try:
                with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, key_path):
                    return True
            except FileNotFoundError:
                continue
        return False
    except Exception as e:
        logger.warning(f"Failed to check WebView2: {e}")
        return True  # Assume available if check fails


def show_webview2_install_dialog():
    """Show dialog to guide user to install WebView2 Runtime"""
    import ctypes
    import webbrowser
    
    message = (
        "检测到系统缺少 WebView2 运行时组件。\n\n"
        "本程序需要 Microsoft Edge WebView2 Runtime 才能正常运行。\n\n"
        "点击「是」打开下载页面安装 WebView2 Runtime，\n"
        "或点击「否」继续尝试启动（可能无法正常使用）。\n\n"
        "如果您已安装最新版 Edge 浏览器，通常已自带此组件。"
    )
    # MB_YESNO | MB_ICONWARNING
    result = ctypes.windll.user32.MessageBoxW(0, message, APP_NAME, 0x04 | 0x30)
    
    # If user clicks "Yes" (6), open download page
    if result == 6:
        webbrowser.open("https://developer.microsoft.com/en-us/microsoft-edge/webview2/")

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

    # Windows: check WebView2 Runtime availability
    if sys.platform == "win32" and not check_windows_webview2():
        show_webview2_install_dialog()
        # Still try to start - might work if detection failed
    
    # Use default backend (WebKit on macOS, EdgeChromium on Windows, GTK WebKit2 on Linux)
    webview.start()

    # Cleanup
    file_server.stop()
    logger.info("Application closed")


if __name__ == "__main__":
    main()
