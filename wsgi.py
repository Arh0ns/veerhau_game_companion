from __future__ import annotations

import io
import os
import sys
from email.message import Message
from http import HTTPStatus
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

os.environ.setdefault("CHRONICLE_DATA_DIR", str(PROJECT_ROOT / "data"))

from app import ChronicleHandler, init_db  # noqa: E402


class WSGIChronicleHandler(ChronicleHandler):
    def __init__(self, environ: dict):
        self.environ = environ
        self.command = environ.get("REQUEST_METHOD", "GET").upper()
        path = environ.get("PATH_INFO") or "/"
        query = environ.get("QUERY_STRING") or ""
        self.path = f"{path}?{query}" if query else path
        self.request_version = environ.get("SERVER_PROTOCOL", "HTTP/1.1")
        self.requestline = f"{self.command} {self.path} {self.request_version}"
        self.client_address = (environ.get("REMOTE_ADDR", ""), 0)
        self.server = None
        self.close_connection = True
        self.rfile = environ.get("wsgi.input") or io.BytesIO()
        self.wfile = io.BytesIO()
        self.headers = self._headers_from_environ(environ)
        self.response_status = HTTPStatus.OK
        self.response_headers: list[tuple[str, str]] = []

    @staticmethod
    def _headers_from_environ(environ: dict) -> Message:
        headers = Message()
        if environ.get("CONTENT_TYPE"):
            headers["Content-Type"] = environ["CONTENT_TYPE"]
        if environ.get("CONTENT_LENGTH"):
            headers["Content-Length"] = environ["CONTENT_LENGTH"]
        for key, value in environ.items():
            if not key.startswith("HTTP_"):
                continue
            name = key[5:].replace("_", "-").title()
            headers[name] = str(value)
        return headers

    def send_response(self, code: int, message: str | None = None) -> None:
        try:
            status = HTTPStatus(code)
        except ValueError:
            status = HTTPStatus.INTERNAL_SERVER_ERROR
        self.response_status = status

    def send_header(self, keyword: str, value: object) -> None:
        self.response_headers.append((keyword, str(value)))

    def end_headers(self) -> None:
        return

    def log_message(self, format: str, *args: object) -> None:
        errors = self.environ.get("wsgi.errors")
        if errors:
            errors.write((format % args) + "\n")


def application(environ, start_response):
    init_db()
    handler = WSGIChronicleHandler(environ)
    method = handler.command
    if method == "OPTIONS":
        handler.do_OPTIONS()
    elif method == "GET":
        handler.do_GET()
    elif method == "POST":
        handler.do_POST()
    elif method == "PUT":
        handler.do_PUT()
    elif method == "DELETE":
        handler.do_DELETE()
    else:
        handler.send_error(HTTPStatus.METHOD_NOT_ALLOWED)

    status = f"{handler.response_status.value} {handler.response_status.phrase}"
    start_response(status, handler.response_headers)
    return [handler.wfile.getvalue()]
