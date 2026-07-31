from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


@dataclass(frozen=True, slots=True)
class Settings:
    root: Path
    data_dir: Path
    static_dir: Path
    database_path: Path
    password: str
    session_days: int
    host: str
    port: int

    @classmethod
    def from_environment(cls) -> Settings:
        root = ROOT
        data_dir = Path(os.environ.get("CHRONICLE_DATA_DIR", root / "data"))
        frontend_dist = root / "frontend" / "dist"
        static_dir = frontend_dist if frontend_dist.exists() else root / "static"
        return cls(
            root=root,
            data_dir=data_dir,
            static_dir=static_dir,
            database_path=data_dir / "chronicle.db",
            password=os.environ.get("CHRONICLE_PASSWORD", "veerhau"),
            session_days=int(os.environ.get("CHRONICLE_SESSION_DAYS", "30")),
            host=os.environ.get(
                "HOST", os.environ.get("CHRONICLE_HOST", "127.0.0.1")
            ),
            port=int(os.environ.get("PORT", os.environ.get("CHRONICLE_PORT", "8787"))),
        )

