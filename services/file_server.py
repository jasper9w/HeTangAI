"""
Local file server for serving generated images and videos
"""
import os
import mimetypes
from pathlib import Path
from http.server import HTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from urllib.parse import unquote
from loguru import logger


class LocalFileHandler(SimpleHTTPRequestHandler):
    """Custom handler for serving local files"""

    def __init__(self, *args, base_dir=None, **kwargs):
        self.base_dir = base_dir or os.getcwd()
        super().__init__(*args, **kwargs)

    def do_GET(self):
        """Handle GET requests for local files"""
        try:
            # Decode URL path
            filepath = unquote(self.path[1:])  # Remove leading '/'

            # Try relative path first (relative to base_dir)
            full_path = os.path.join(self.base_dir, filepath)

            if os.path.isfile(full_path):
                self.serve_file(full_path)
                return

            # Try absolute path
            if os.path.isfile(filepath):
                self.serve_file(filepath)
                return

            # File not found
            self.send_error(404, f"File not found: {filepath}")

        except Exception as e:
            logger.error(f"Error serving file: {e}")
            self.send_error(500, str(e))

    def serve_file(self, filepath):
        """Serve a file with appropriate MIME type"""
        try:
            # Guess MIME type
            mime_type, _ = mimetypes.guess_type(filepath)
            if not mime_type:
                mime_type = 'application/octet-stream'

            # Read file
            with open(filepath, 'rb') as f:
                content = f.read()

            # Send response
            self.send_response(200)
            self.send_header('Content-Type', mime_type)
            self.send_header('Content-Length', len(content))
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(content)

            logger.debug(f"Served file: {filepath} ({mime_type})")

        except Exception as e:
            logger.error(f"Error reading file {filepath}: {e}")
            self.send_error(500, str(e))

    def log_message(self, format, *args):
        """Override to use loguru instead of print"""
        logger.debug(f"File server: {format % args}")


class LocalFileServer:
    """Local HTTP server for serving files"""

    def __init__(self, port=8765, base_dir=None):
        self.port = port
        self.base_dir = base_dir or os.getcwd()
        self.server = None
        self.thread = None

    def start(self):
        """Start the file server in a background thread"""
        try:
            # Create handler with base_dir
            handler = lambda *args, **kwargs: LocalFileHandler(
                *args, base_dir=self.base_dir, **kwargs
            )

            self.server = HTTPServer(('127.0.0.1', self.port), handler)
            self.thread = Thread(target=self.server.serve_forever, daemon=True)
            self.thread.start()

            logger.info(f"Local file server started on http://127.0.0.1:{self.port}")
            logger.info(f"Serving files from: {self.base_dir}")

        except Exception as e:
            logger.error(f"Failed to start file server: {e}")
            raise

    def stop(self):
        """Stop the file server"""
        if self.server:
            self.server.shutdown()
            logger.info("Local file server stopped")

    def get_url(self, filepath: str) -> str:
        """Convert a file path to a server URL"""
        # Convert absolute path to relative if possible
        try:
            rel_path = os.path.relpath(filepath, self.base_dir)
            if not rel_path.startswith('..'):
                # File is under base_dir, use relative path
                return f"http://127.0.0.1:{self.port}/{rel_path}"
        except ValueError:
            # Different drives on Windows, use absolute path
            pass

        # Use absolute path
        return f"http://127.0.0.1:{self.port}/{filepath}"
