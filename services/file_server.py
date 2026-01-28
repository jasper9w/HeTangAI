"""
Local file server for serving generated images and videos
Based on Bottle framework
"""
import os
from pathlib import Path
from threading import Thread
from bottle import Bottle, static_file, route, response
from loguru import logger


class LocalFileServer:
    """Local HTTP server for serving files using Bottle"""

    def __init__(self, port=8765, base_dir=None):
        self.port = port
        self.base_dir = base_dir or os.getcwd()
        self.app = Bottle()
        self.thread = None
        self._setup_routes()

    def _setup_routes(self):
        """Setup bottle routes"""
        # Add CORS headers to all responses
        @self.app.hook('after_request')
        def enable_cors():
            response.headers['Access-Control-Allow-Origin'] = '*'
            response.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
            response.headers['Access-Control-Allow-Headers'] = 'Origin, Content-Type'

        @self.app.route('/<filepath:path>')
        def server_static(filepath):
            # Try absolute path first
            if os.path.isfile(filepath):
                return static_file(os.path.basename(filepath),
                                   root=os.path.dirname(filepath),
                                   mimetype='auto')

            # Try with leading slash (absolute path)
            full_path = '/' + filepath
            if os.path.isfile(full_path):
                return static_file(os.path.basename(full_path),
                                   root=os.path.dirname(full_path),
                                   mimetype='auto')

            # Try relative to current working directory
            cwd_path = os.path.join(os.getcwd(), filepath)
            if os.path.isfile(cwd_path):
                return static_file(os.path.basename(cwd_path),
                                   root=os.path.dirname(cwd_path),
                                   mimetype='auto')

            # Try relative to base directory
            base_path = os.path.join(self.base_dir, filepath)
            if os.path.isfile(base_path):
                return static_file(os.path.basename(base_path),
                                   root=os.path.dirname(base_path),
                                   mimetype='auto')

            # File not found
            from bottle import abort
            abort(404, f"File not found: {filepath}")

    def start(self):
        """Start the file server in a background thread"""
        try:
            def run_server():
                self.app.run(host='127.0.0.1', port=self.port, quiet=True)

            self.thread = Thread(target=run_server, daemon=True)
            self.thread.start()

            logger.info(f"Local file server started on http://127.0.0.1:{self.port}")
            logger.info(f"Serving files from: {self.base_dir}")

        except Exception as e:
            logger.error(f"Failed to start file server: {e}")
            raise

    def stop(self):
        """Stop the file server"""
        # Bottle doesn't have a clean shutdown method when running in thread
        # The daemon thread will be terminated when main process exits
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