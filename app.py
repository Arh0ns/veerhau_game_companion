from __future__ import annotations

import datetime as dt
import hashlib
import json
import mimetypes
import os
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse
import secrets
import sqlite3
import sys


ROOT = Path(__file__).resolve().parent
STATIC_DIR = ROOT / "static"
DATA_DIR = ROOT / "data"
DB_PATH = DATA_DIR / "chronicle.db"

APP_PASSWORD = os.environ.get("CHRONICLE_PASSWORD", "veerhau")
SESSION_DAYS = int(os.environ.get("CHRONICLE_SESSION_DAYS", "30"))
PORT = int(os.environ.get("PORT", os.environ.get("CHRONICLE_PORT", "8787")))

ENTITIES = {
    "campaigns": "cmp",
    "coteries": "cot",
    "characters": "chr",
    "factions": "fac",
    "locations": "loc",
    "events": "evt",
    "facts": "fact",
    "clues": "clue",
    "storylines": "story",
    "theories": "theory",
    "notes": "note",
    "memoirs": "memoir",
    "investigationBoards": "board",
}


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def parse_utc(value: str) -> dt.datetime:
    return dt.datetime.fromisoformat(value.replace("Z", "+00:00"))


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def new_id(entity: str) -> str:
    return f"{ENTITIES[entity]}_{secrets.token_hex(8)}"


def get_db() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with get_db() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS records (
                entity TEXT NOT NULL,
                id TEXT NOT NULL,
                data TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (entity, id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS relationships (
                id TEXT PRIMARY KEY,
                source_type TEXT NOT NULL,
                source_id TEXT NOT NULL,
                target_type TEXT NOT NULL,
                target_id TEXT NOT NULL,
                relation_label TEXT NOT NULL DEFAULT '',
                notes TEXT NOT NULL DEFAULT '',
                edge_color TEXT NOT NULL DEFAULT '',
                arrow_direction TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
            """
        )
        seed_version = conn.execute(
            "SELECT value FROM settings WHERE key = 'seed_version'"
        ).fetchone()
        if not seed_version:
            seed_initial_data(conn)
            conn.execute(
                "INSERT INTO settings(key, value) VALUES('seed_version', '1')"
            )
            seed_version = {"value": "1"}
        if str(seed_version["value"]) < "2":
            migrate_v2_coterie(conn)
            conn.execute(
                "INSERT OR REPLACE INTO settings(key, value) VALUES('seed_version', '2')"
            )
            seed_version = {"value": "2"}
        if str(seed_version["value"]) < "3":
            migrate_v3_dedupe_relationships(conn)
            conn.execute(
                "INSERT OR REPLACE INTO settings(key, value) VALUES('seed_version', '3')"
            )
            seed_version = {"value": "3"}
        if str(seed_version["value"]) < "4":
            migrate_v4_relationship_styles(conn)
            conn.execute(
                "INSERT OR REPLACE INTO settings(key, value) VALUES('seed_version', '4')"
            )
            seed_version = {"value": "4"}
        if str(seed_version["value"]) < "5":
            migrate_v5_investigation_boards(conn)
            conn.execute(
                "INSERT OR REPLACE INTO settings(key, value) VALUES('seed_version', '5')"
            )
            seed_version = {"value": "5"}
        if str(seed_version["value"]) < "6":
            migrate_v6_remove_character_visibility(conn)
            conn.execute(
                "INSERT OR REPLACE INTO settings(key, value) VALUES('seed_version', '6')"
            )


def seed_initial_data(conn: sqlite3.Connection) -> None:
    now = utc_now()
    campaign = {
        "title": "Хроника ночного города",
        "description": (
            "Заготовка кампании для городского мистического расследования: "
            "кланы, долги, улики, исчезновения и личные дневники персонажей."
        ),
        "setting": "World of Darkness / Vampire: The Masquerade",
    }
    put_record(conn, "campaigns", "cmp_main", campaign, now, now)

    put_record(
        conn,
        "coteries",
        "cot_main",
        {
            "name": "Котерия",
            "description": "Группа игровых персонажей хроники.",
            "goals": "",
            "haven": "",
            "memberIds": ["chr_julia", "chr_dietrich", "chr_ray", "chr_garrett"],
            "notes": "",
        },
        now,
        now,
    )

    for slug, name in [
        ("julia", "Джулия"),
        ("dietrich", "Дитрих"),
        ("ray", "Рей"),
        ("garrett", "Гаррет"),
    ]:
        put_record(
            conn,
            "characters",
            f"chr_{slug}",
            {
                "name": name,
                "characterType": "Игровой персонаж",
                "description": "",
                "status": "Активен",
                "coterieId": "cot_main",
                "factionId": "",
                "notes": "",
            },
            now,
            now,
        )

    put_record(
        conn,
        "investigationBoards",
        "board_main",
        default_investigation_board(),
        now,
        now,
    )


def migrate_v2_coterie(conn: sqlite3.Connection) -> None:
    now = utc_now()
    player_ids = ["chr_julia", "chr_dietrich", "chr_ray", "chr_garrett"]
    row = conn.execute(
        "SELECT * FROM records WHERE entity = ? AND id = ?",
        ("coteries", "cot_main"),
    ).fetchone()
    if not row:
        put_record(
            conn,
            "coteries",
            "cot_main",
            {
                "name": "Котерия",
                "description": "Группа игровых персонажей хроники.",
                "goals": "",
                "haven": "",
                "memberIds": player_ids,
                "notes": "",
            },
            now,
            now,
        )
    for character_id in player_ids:
        row = conn.execute(
            "SELECT * FROM records WHERE entity = ? AND id = ?",
            ("characters", character_id),
        ).fetchone()
        if not row:
            continue
        payload = json.loads(row["data"])
        payload["coterieId"] = payload.get("coterieId") or "cot_main"
        put_record(
            conn,
            "characters",
            character_id,
            payload,
            row["created_at"],
            now,
        )


def relationship_pair_key(row: sqlite3.Row | dict) -> tuple[str, str]:
    left = f"{row['source_type']}:{row['source_id']}"
    right = f"{row['target_type']}:{row['target_id']}"
    return tuple(sorted((left, right)))


def migrate_v3_dedupe_relationships(conn: sqlite3.Connection) -> None:
    rows = conn.execute(
        "SELECT * FROM relationships ORDER BY created_at ASC, id ASC"
    ).fetchall()
    by_pair: dict[tuple[str, str], list[sqlite3.Row]] = {}
    for row in rows:
        by_pair.setdefault(relationship_pair_key(row), []).append(row)
    for duplicates in by_pair.values():
        if len(duplicates) <= 1:
            continue
        keeper = duplicates[0]
        label = next((row["relation_label"] for row in duplicates if row["relation_label"]), keeper["relation_label"])
        notes = "\n\n".join(dict.fromkeys(row["notes"] for row in duplicates if row["notes"]))
        conn.execute(
            """
            UPDATE relationships
            SET relation_label = ?, notes = ?, updated_at = ?
            WHERE id = ?
            """,
            (label, notes, utc_now(), keeper["id"]),
        )
        for row in duplicates[1:]:
            conn.execute("DELETE FROM relationships WHERE id = ?", (row["id"],))


def migrate_v4_relationship_styles(conn: sqlite3.Connection) -> None:
    columns = {
        row["name"] for row in conn.execute("PRAGMA table_info(relationships)").fetchall()
    }
    if "edge_color" not in columns:
        conn.execute("ALTER TABLE relationships ADD COLUMN edge_color TEXT NOT NULL DEFAULT ''")
    if "arrow_direction" not in columns:
        conn.execute("ALTER TABLE relationships ADD COLUMN arrow_direction TEXT NOT NULL DEFAULT ''")


def default_investigation_board(items: list[dict] | None = None) -> dict:
    return {
        "name": "Основная доска",
        "description": "Рабочая доска активного расследования.",
        "status": "Активна",
        "storylineId": "",
        "items": items or [],
        "groups": [],
        "viewport": {"x": 0, "y": 0, "zoom": 1},
    }


def migrate_v5_investigation_boards(conn: sqlite3.Connection) -> None:
    existing = conn.execute(
        "SELECT id FROM records WHERE entity = ? LIMIT 1",
        ("investigationBoards",),
    ).fetchone()
    if existing:
        return
    items: list[dict] = []
    rows = conn.execute(
        """
        SELECT entity, id, data
        FROM records
        WHERE entity IN ('storylines', 'events', 'facts', 'clues', 'theories')
        ORDER BY created_at ASC
        """
    ).fetchall()
    for row in rows:
        payload = json.loads(row["data"])
        position = payload.get("boardPosition") or {}
        if not (
            isinstance(position, dict)
            and isinstance(position.get("x"), (int, float))
            and isinstance(position.get("y"), (int, float))
        ):
            continue
        items.append(
            {
                "entity": row["entity"],
                "id": row["id"],
                "x": round(position["x"]),
                "y": round(position["y"]),
            }
        )
    now = utc_now()
    put_record(
        conn,
        "investigationBoards",
        "board_main",
        default_investigation_board(items),
        now,
        now,
    )


def migrate_v6_remove_character_visibility(conn: sqlite3.Connection) -> None:
    removals = {
        "events": {"knownByIds"},
        "facts": {"knownByIds", "unknownByIds"},
        "clues": {"knownByIds"},
    }
    now = utc_now()
    for entity, keys in removals.items():
        rows = conn.execute(
            "SELECT * FROM records WHERE entity = ?",
            (entity,),
        ).fetchall()
        for row in rows:
            payload = json.loads(row["data"])
            changed = False
            for key in keys:
                if key in payload:
                    payload.pop(key, None)
                    changed = True
            if changed:
                put_record(conn, entity, row["id"], payload, row["created_at"], now)


def put_record(
    conn: sqlite3.Connection,
    entity: str,
    record_id: str,
    payload: dict,
    created_at: str,
    updated_at: str,
) -> None:
    conn.execute(
        """
        INSERT OR REPLACE INTO records(entity, id, data, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            entity,
            record_id,
            json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
            created_at,
            updated_at,
        ),
    )


def row_to_record(row: sqlite3.Row) -> dict:
    payload = json.loads(row["data"])
    payload["id"] = row["id"]
    payload["createdAt"] = row["created_at"]
    payload["updatedAt"] = row["updated_at"]
    return payload


def row_to_relationship(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "sourceType": row["source_type"],
        "sourceId": row["source_id"],
        "targetType": row["target_type"],
        "targetId": row["target_id"],
        "relationLabel": row["relation_label"],
        "notes": row["notes"],
        "edgeColor": row["edge_color"],
        "arrowDirection": row["arrow_direction"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def normalize_arrow_direction(value: object) -> str:
    value = str(value or "")
    if value in {"source-to-target", "target-to-source"}:
        return value
    return ""


def find_relationship_between(
    conn: sqlite3.Connection,
    source_type: str,
    source_id: str,
    target_type: str,
    target_id: str,
    exclude_id: str | None = None,
) -> sqlite3.Row | None:
    params: list[str] = [
        source_type,
        source_id,
        target_type,
        target_id,
        target_type,
        target_id,
        source_type,
        source_id,
    ]
    exclude_sql = ""
    if exclude_id:
        exclude_sql = " AND id <> ?"
        params.append(exclude_id)
    return conn.execute(
        f"""
        SELECT * FROM relationships
        WHERE (
            (source_type = ? AND source_id = ? AND target_type = ? AND target_id = ?)
            OR
            (source_type = ? AND source_id = ? AND target_type = ? AND target_id = ?)
        )
        {exclude_sql}
        ORDER BY created_at ASC, id ASC
        LIMIT 1
        """,
        params,
    ).fetchone()


def clean_payload(payload: dict) -> dict:
    if not isinstance(payload, dict):
        return {}
    blocked = {"id", "createdAt", "updatedAt", "created_at", "updated_at"}
    return {key: value for key, value in payload.items() if key not in blocked}


class ChronicleHandler(BaseHTTPRequestHandler):
    server_version = "VeerhauChronicle/1.0"

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self.handle_api("GET", parsed.path)
            return
        self.serve_static(parsed.path)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self.handle_api("POST", parsed.path)
            return
        self.send_error(HTTPStatus.NOT_FOUND)

    def do_PUT(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self.handle_api("PUT", parsed.path)
            return
        self.send_error(HTTPStatus.NOT_FOUND)

    def do_DELETE(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self.handle_api("DELETE", parsed.path)
            return
        self.send_error(HTTPStatus.NOT_FOUND)

    def serve_static(self, path: str) -> None:
        if path in ("", "/"):
            target = STATIC_DIR / "index.html"
        else:
            relative = Path(unquote(path.lstrip("/")))
            if relative.parts and relative.parts[0] == "static":
                relative = Path(*relative.parts[1:])
            target = STATIC_DIR / relative

        try:
            target = target.resolve()
            if STATIC_DIR.resolve() not in target.parents and target != (STATIC_DIR / "index.html").resolve():
                self.send_error(HTTPStatus.FORBIDDEN)
                return
            if not target.exists() or not target.is_file():
                target = STATIC_DIR / "index.html"
            content = target.read_bytes()
            mime = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", f"{mime}; charset=utf-8")
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        except OSError:
            self.send_error(HTTPStatus.NOT_FOUND)

    def handle_api(self, method: str, path: str) -> None:
        try:
            if path == "/api/session" and method == "GET":
                self.send_json({"authenticated": self.current_session_hash() is not None})
                return
            if path == "/api/login" and method == "POST":
                self.login()
                return
            if path == "/api/logout" and method == "POST":
                self.logout()
                return

            if self.current_session_hash() is None:
                self.send_json({"error": "Требуется пароль."}, HTTPStatus.UNAUTHORIZED)
                return

            parts = [unquote(part) for part in path.strip("/").split("/")]
            if path == "/api/bootstrap" and method == "GET":
                self.bootstrap()
                return
            if len(parts) >= 2 and parts[0] == "api":
                resource = parts[1]
                record_id = parts[2] if len(parts) > 2 else None
                if resource == "relationships":
                    self.relationships(method, record_id)
                    return
                if resource in ENTITIES:
                    self.records(method, resource, record_id)
                    return
            self.send_json({"error": "Неизвестный endpoint."}, HTTPStatus.NOT_FOUND)
        except json.JSONDecodeError:
            self.send_json({"error": "Некорректный JSON."}, HTTPStatus.BAD_REQUEST)
        except Exception as exc:  # pragma: no cover - defensive server boundary
            self.send_json({"error": f"Ошибка сервера: {exc}"}, HTTPStatus.INTERNAL_SERVER_ERROR)

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            return {}
        body = self.rfile.read(length).decode("utf-8")
        return json.loads(body or "{}")

    def send_json(
        self,
        payload: dict | list,
        status: HTTPStatus = HTTPStatus.OK,
        headers: dict[str, str] | None = None,
    ) -> None:
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(raw)

    def login(self) -> None:
        payload = self.read_json()
        password = str(payload.get("password", ""))
        if not secrets.compare_digest(password, APP_PASSWORD):
            self.send_json({"error": "Неверный пароль."}, HTTPStatus.UNAUTHORIZED)
            return

        token = secrets.token_urlsafe(32)
        token_hash = hash_token(token)
        created_at = utc_now()
        expires_at = (
            dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=SESSION_DAYS)
        ).replace(microsecond=0).isoformat()
        with get_db() as conn:
            conn.execute(
                "INSERT INTO sessions(token_hash, created_at, expires_at) VALUES (?, ?, ?)",
                (token_hash, created_at, expires_at),
            )
        max_age = SESSION_DAYS * 24 * 60 * 60
        cookie = (
            f"vc_session={token}; HttpOnly; Path=/; SameSite=Lax; Max-Age={max_age}"
        )
        self.send_json({"ok": True}, headers={"Set-Cookie": cookie})

    def logout(self) -> None:
        session_hash = self.current_session_hash()
        if session_hash:
            with get_db() as conn:
                conn.execute("DELETE FROM sessions WHERE token_hash = ?", (session_hash,))
        cookie = "vc_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0"
        self.send_json({"ok": True}, headers={"Set-Cookie": cookie})

    def current_session_hash(self) -> str | None:
        raw_cookie = self.headers.get("Cookie")
        if not raw_cookie:
            return None
        cookie = SimpleCookie()
        cookie.load(raw_cookie)
        token = cookie.get("vc_session")
        if not token:
            return None
        token_hash = hash_token(token.value)
        with get_db() as conn:
            conn.execute("DELETE FROM sessions WHERE expires_at < ?", (utc_now(),))
            row = conn.execute(
                "SELECT token_hash, expires_at FROM sessions WHERE token_hash = ?",
                (token_hash,),
            ).fetchone()
            if not row:
                return None
            if parse_utc(row["expires_at"]) < dt.datetime.now(dt.timezone.utc):
                conn.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))
                return None
        return token_hash

    def bootstrap(self) -> None:
        result: dict[str, list] = {}
        with get_db() as conn:
            for entity in ENTITIES:
                rows = conn.execute(
                    "SELECT * FROM records WHERE entity = ? ORDER BY created_at ASC",
                    (entity,),
                ).fetchall()
                result[entity] = [row_to_record(row) for row in rows]
            rel_rows = conn.execute(
                "SELECT * FROM relationships ORDER BY created_at ASC"
            ).fetchall()
            result["relationships"] = [row_to_relationship(row) for row in rel_rows]
        self.send_json(result)

    def records(self, method: str, entity: str, record_id: str | None) -> None:
        with get_db() as conn:
            if method == "GET" and not record_id:
                rows = conn.execute(
                    "SELECT * FROM records WHERE entity = ? ORDER BY created_at ASC",
                    (entity,),
                ).fetchall()
                self.send_json([row_to_record(row) for row in rows])
                return
            if method == "POST" and not record_id:
                payload = clean_payload(self.read_json())
                now = utc_now()
                record_id = new_id(entity)
                put_record(conn, entity, record_id, payload, now, now)
                row = conn.execute(
                    "SELECT * FROM records WHERE entity = ? AND id = ?",
                    (entity, record_id),
                ).fetchone()
                self.send_json(row_to_record(row), HTTPStatus.CREATED)
                return
            if not record_id:
                self.send_json({"error": "Не указан id."}, HTTPStatus.BAD_REQUEST)
                return

            row = conn.execute(
                "SELECT * FROM records WHERE entity = ? AND id = ?",
                (entity, record_id),
            ).fetchone()
            if not row:
                self.send_json({"error": "Объект не найден."}, HTTPStatus.NOT_FOUND)
                return

            if method == "GET":
                self.send_json(row_to_record(row))
                return
            if method == "PUT":
                current = row_to_record(row)
                current.update(clean_payload(self.read_json()))
                current.pop("id", None)
                created_at = row["created_at"]
                updated_at = utc_now()
                put_record(conn, entity, record_id, current, created_at, updated_at)
                updated = conn.execute(
                    "SELECT * FROM records WHERE entity = ? AND id = ?",
                    (entity, record_id),
                ).fetchone()
                self.send_json(row_to_record(updated))
                return
            if method == "DELETE":
                if entity == "campaigns":
                    self.send_json(
                        {"error": "Кампанию нельзя удалить в MVP."},
                        HTTPStatus.BAD_REQUEST,
                    )
                    return
                conn.execute(
                    "DELETE FROM relationships WHERE (source_type = ? AND source_id = ?) OR (target_type = ? AND target_id = ?)",
                    (entity, record_id, entity, record_id),
                )
                conn.execute(
                    "DELETE FROM records WHERE entity = ? AND id = ?",
                    (entity, record_id),
                )
                self.send_json({"ok": True})
                return
        self.send_json({"error": "Метод не поддерживается."}, HTTPStatus.METHOD_NOT_ALLOWED)

    def relationships(self, method: str, relationship_id: str | None) -> None:
        with get_db() as conn:
            if method == "GET" and not relationship_id:
                rows = conn.execute(
                    "SELECT * FROM relationships ORDER BY created_at ASC"
                ).fetchall()
                self.send_json([row_to_relationship(row) for row in rows])
                return
            if method == "POST" and not relationship_id:
                payload = self.read_json()
                source_type = str(payload.get("sourceType", ""))
                source_id = str(payload.get("sourceId", ""))
                target_type = str(payload.get("targetType", ""))
                target_id = str(payload.get("targetId", ""))
                if source_type not in ENTITIES or target_type not in ENTITIES:
                    self.send_json({"error": "Некорректный тип связи."}, HTTPStatus.BAD_REQUEST)
                    return
                existing = find_relationship_between(
                    conn, source_type, source_id, target_type, target_id
                )
                if existing:
                    edge_color = (
                        str(payload.get("edgeColor", ""))
                        if "edgeColor" in payload
                        else existing["edge_color"]
                    )
                    arrow_direction = normalize_arrow_direction(
                        payload.get("arrowDirection", existing["arrow_direction"])
                    )
                    conn.execute(
                        """
                        UPDATE relationships
                        SET relation_label = ?, notes = ?, edge_color = ?, arrow_direction = ?, updated_at = ?
                        WHERE id = ?
                        """,
                        (
                            str(payload.get("relationLabel", existing["relation_label"])),
                            str(payload.get("notes", existing["notes"])),
                            edge_color,
                            arrow_direction,
                            utc_now(),
                            existing["id"],
                        ),
                    )
                    row = conn.execute(
                        "SELECT * FROM relationships WHERE id = ?",
                        (existing["id"],),
                    ).fetchone()
                    self.send_json(row_to_relationship(row))
                    return
                now = utc_now()
                relationship_id = f"rel_{secrets.token_hex(8)}"
                conn.execute(
                    """
                    INSERT INTO relationships(
                        id, source_type, source_id, target_type, target_id,
                        relation_label, notes, edge_color, arrow_direction, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        relationship_id,
                        source_type,
                        source_id,
                        target_type,
                        target_id,
                        str(payload.get("relationLabel", "")),
                        str(payload.get("notes", "")),
                        str(payload.get("edgeColor", "")),
                        normalize_arrow_direction(payload.get("arrowDirection", "")),
                        now,
                        now,
                    ),
                )
                row = conn.execute(
                    "SELECT * FROM relationships WHERE id = ?",
                    (relationship_id,),
                ).fetchone()
                self.send_json(row_to_relationship(row), HTTPStatus.CREATED)
                return
            if not relationship_id:
                self.send_json({"error": "Не указан id связи."}, HTTPStatus.BAD_REQUEST)
                return
            row = conn.execute(
                "SELECT * FROM relationships WHERE id = ?",
                (relationship_id,),
            ).fetchone()
            if not row:
                self.send_json({"error": "Связь не найдена."}, HTTPStatus.NOT_FOUND)
                return
            if method == "DELETE":
                conn.execute("DELETE FROM relationships WHERE id = ?", (relationship_id,))
                self.send_json({"ok": True})
                return
            if method == "GET":
                self.send_json(row_to_relationship(row))
                return
            if method == "PUT":
                payload = self.read_json()
                source_type = str(payload.get("sourceType", row["source_type"]))
                source_id = str(payload.get("sourceId", row["source_id"]))
                target_type = str(payload.get("targetType", row["target_type"]))
                target_id = str(payload.get("targetId", row["target_id"]))
                existing = find_relationship_between(
                    conn,
                    source_type,
                    source_id,
                    target_type,
                    target_id,
                    exclude_id=relationship_id,
                )
                if existing:
                    edge_color = (
                        str(payload.get("edgeColor", ""))
                        if "edgeColor" in payload
                        else row["edge_color"] or existing["edge_color"]
                    )
                    arrow_direction = normalize_arrow_direction(
                        payload.get("arrowDirection", row["arrow_direction"] or existing["arrow_direction"])
                    )
                    conn.execute(
                        """
                        UPDATE relationships
                        SET relation_label = ?, notes = ?, edge_color = ?, arrow_direction = ?, updated_at = ?
                        WHERE id = ?
                        """,
                        (
                            str(payload.get("relationLabel", existing["relation_label"])),
                            str(payload.get("notes", existing["notes"])),
                            edge_color,
                            arrow_direction,
                            utc_now(),
                            existing["id"],
                        ),
                    )
                    conn.execute("DELETE FROM relationships WHERE id = ?", (relationship_id,))
                    updated = conn.execute(
                        "SELECT * FROM relationships WHERE id = ?",
                        (existing["id"],),
                    ).fetchone()
                    self.send_json(row_to_relationship(updated))
                    return
                conn.execute(
                    """
                    UPDATE relationships
                    SET source_type = ?, source_id = ?, target_type = ?, target_id = ?,
                        relation_label = ?, notes = ?, edge_color = ?, arrow_direction = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (
                        source_type,
                        source_id,
                        target_type,
                        target_id,
                        str(payload.get("relationLabel", row["relation_label"])),
                        str(payload.get("notes", row["notes"])),
                        str(payload.get("edgeColor", row["edge_color"])),
                        normalize_arrow_direction(payload.get("arrowDirection", row["arrow_direction"])),
                        utc_now(),
                        relationship_id,
                    ),
                )
                updated = conn.execute(
                    "SELECT * FROM relationships WHERE id = ?",
                    (relationship_id,),
                ).fetchone()
                self.send_json(row_to_relationship(updated))
                return
        self.send_json({"error": "Метод не поддерживается."}, HTTPStatus.METHOD_NOT_ALLOWED)


def run() -> None:
    init_db()
    server = ThreadingHTTPServer(("127.0.0.1", PORT), ChronicleHandler)
    print(f"Veerhau's Companion: http://127.0.0.1:{PORT}")
    print("Пароль по умолчанию: veerhau")
    server.serve_forever()


if __name__ == "__main__":
    init_db()
    if "--init-only" in sys.argv:
        print(f"Database ready: {DB_PATH}")
    else:
        run()
