from __future__ import annotations

import sys

from chronicle.main import run, settings
from chronicle.presentation.api import build_container


if __name__ == "__main__":
    if "--init-only" in sys.argv:
        build_container(settings)
        print(f"Database ready: {settings.database_path}")
    else:
        run()

