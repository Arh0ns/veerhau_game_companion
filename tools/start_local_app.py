from __future__ import annotations

import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LOGS = ROOT / "logs"
PID_FILE = LOGS / "local-app.pid"
ENV_FILE = ROOT / ".env"
PORT = "8787"


def read_password() -> str:
    if ENV_FILE.exists():
      for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
          if line.strip().startswith("CHRONICLE_PASSWORD="):
              value = line.split("=", 1)[1].strip().strip("\"'")
              if value:
                  return value
    password = "vc-" + os.urandom(8).hex()
    ENV_FILE.write_text(f"CHRONICLE_PASSWORD={password}\n", encoding="utf-8")
    return password


def clean_environment(password: str) -> dict[str, str]:
    env: dict[str, str] = {}
    path_value = ""
    for key, value in os.environ.items():
        if key.lower() == "path":
            path_value = value
            continue
        env[key] = value
    if path_value:
        env["Path"] = path_value
    env["CHRONICLE_PASSWORD"] = password
    env["CHRONICLE_HOST"] = "127.0.0.1"
    env["CHRONICLE_PORT"] = PORT
    env["CHRONICLE_DATA_DIR"] = str(ROOT / "data")
    return env


def is_running() -> bool:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/api/session", timeout=2) as response:
            return response.status == 200
    except Exception:
        return False


def main() -> int:
    LOGS.mkdir(exist_ok=True)
    password = read_password()

    if is_running():
        print(f"Already running: http://127.0.0.1:{PORT}")
        print(f"Password: {password}")
        return 0

    stdout = open(LOGS / "local-app.out.log", "ab")
    stderr = open(LOGS / "local-app.err.log", "ab")
    creationflags = 0
    if os.name == "nt":
        creationflags = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS
    process = subprocess.Popen(
        [sys.executable, "app.py"],
        cwd=ROOT,
        env=clean_environment(password),
        stdout=stdout,
        stderr=stderr,
        stdin=subprocess.DEVNULL,
        creationflags=creationflags,
    )
    PID_FILE.write_text(str(process.pid), encoding="utf-8")

    for _ in range(30):
        if process.poll() is not None:
            print(f"App exited early with code {process.returncode}. See logs/local-app.err.log")
            return 1
        if is_running():
            print(f"Local URL: http://127.0.0.1:{PORT}")
            print(f"Password: {password}")
            print(f"PID: {process.pid}")
            return 0
        time.sleep(1)

    print("App did not become ready. See logs/local-app.err.log")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
