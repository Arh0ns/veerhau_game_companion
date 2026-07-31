from __future__ import annotations

import os
from pathlib import Path

import uvicorn

from chronicle.config import ROOT, Settings
from chronicle.presentation.api import create_app


def load_local_environment(path: Path = ROOT / ".env") -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_local_environment()
settings = Settings.from_environment()
app = create_app(settings)


def run() -> None:
    shown_host = "127.0.0.1" if settings.host in {"0.0.0.0", "::"} else settings.host
    print(f"Veerhau's Companion: http://{shown_host}:{settings.port}")
    uvicorn.run(app, host=settings.host, port=settings.port, proxy_headers=True)


if __name__ == "__main__":
    run()

