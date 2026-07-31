from __future__ import annotations

import datetime as dt
import json
import secrets
import sqlite3
from typing import Any


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def _put_record(
    conn: sqlite3.Connection,
    entity: str,
    record_id: str,
    payload: dict[str, Any],
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


def _default_board(items: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    return {
        "name": "Основная доска",
        "description": "Рабочая доска активного расследования.",
        "status": "Активна",
        "storylineId": "",
        "items": items or [],
        "groups": [],
        "viewport": {"x": 0, "y": 0, "zoom": 1},
    }


def _seed_initial_data(conn: sqlite3.Connection) -> None:
    now = utc_now()
    _put_record(
        conn,
        "campaigns",
        "cmp_main",
        {
            "title": "Хроника ночного города",
            "description": "Заготовка кампании для городского мистического расследования.",
            "setting": "World of Darkness / Vampire: The Masquerade",
        },
        now,
        now,
    )
    player_ids = ["chr_julia", "chr_dietrich", "chr_ray", "chr_garrett"]
    _put_record(
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
    for slug, name in (
        ("julia", "Джулия"),
        ("dietrich", "Дитрих"),
        ("ray", "Рей"),
        ("garrett", "Гаррет"),
    ):
        _put_record(
            conn,
            "characters",
            f"chr_{slug}",
            {
                "name": name,
                "characterType": "Игровой персонаж",
                "species": "Не известно",
                "status": "Активен",
                "coterieId": "cot_main",
                "factionId": "",
                "description": "",
                "notes": "",
            },
            now,
            now,
        )
    _put_record(conn, "investigationBoards", "board_main", _default_board(), now, now)


def _relationship_pair_key(row: sqlite3.Row) -> tuple[str, str]:
    return tuple(
        sorted(
            (
                f"{row['source_type']}:{row['source_id']}",
                f"{row['target_type']}:{row['target_id']}",
            )
        )
    )


def _migrate_v2_coterie(conn: sqlite3.Connection) -> None:
    now = utc_now()
    player_ids = ["chr_julia", "chr_dietrich", "chr_ray", "chr_garrett"]
    row = conn.execute(
        "SELECT * FROM records WHERE entity='coteries' AND id='cot_main'"
    ).fetchone()
    if not row:
        _put_record(
            conn,
            "coteries",
            "cot_main",
            {"name": "Котерия", "memberIds": player_ids},
            now,
            now,
        )
    for character_id in player_ids:
        row = conn.execute(
            "SELECT * FROM records WHERE entity='characters' AND id=?",
            (character_id,),
        ).fetchone()
        if row:
            payload = json.loads(row["data"])
            payload["coterieId"] = payload.get("coterieId") or "cot_main"
            _put_record(conn, "characters", character_id, payload, row["created_at"], now)


def _migrate_v3_dedupe_relationships(conn: sqlite3.Connection) -> None:
    rows = conn.execute(
        "SELECT * FROM relationships ORDER BY created_at ASC, id ASC"
    ).fetchall()
    by_pair: dict[tuple[str, str], list[sqlite3.Row]] = {}
    for row in rows:
        by_pair.setdefault(_relationship_pair_key(row), []).append(row)
    for duplicates in by_pair.values():
        if len(duplicates) <= 1:
            continue
        keeper = duplicates[0]
        label = next(
            (row["relation_label"] for row in duplicates if row["relation_label"]),
            keeper["relation_label"],
        )
        notes = "\n\n".join(
            dict.fromkeys(row["notes"] for row in duplicates if row["notes"])
        )
        conn.execute(
            "UPDATE relationships SET relation_label=?, notes=?, updated_at=? WHERE id=?",
            (label, notes, utc_now(), keeper["id"]),
        )
        for row in duplicates[1:]:
            conn.execute("DELETE FROM relationships WHERE id=?", (row["id"],))


def _migrate_v4_relationship_styles(conn: sqlite3.Connection) -> None:
    columns = {
        row["name"] for row in conn.execute("PRAGMA table_info(relationships)").fetchall()
    }
    if "edge_color" not in columns:
        conn.execute(
            "ALTER TABLE relationships ADD COLUMN edge_color TEXT NOT NULL DEFAULT ''"
        )
    if "arrow_direction" not in columns:
        conn.execute(
            "ALTER TABLE relationships ADD COLUMN arrow_direction TEXT NOT NULL DEFAULT ''"
        )


def _migrate_v5_investigation_boards(conn: sqlite3.Connection) -> None:
    if conn.execute(
        "SELECT 1 FROM records WHERE entity='investigationBoards' LIMIT 1"
    ).fetchone():
        return
    items: list[dict[str, Any]] = []
    rows = conn.execute(
        "SELECT entity,id,data FROM records WHERE entity IN ('storylines','events','facts','clues','theories') ORDER BY created_at"
    ).fetchall()
    for row in rows:
        position = json.loads(row["data"]).get("boardPosition") or {}
        if isinstance(position.get("x"), (int, float)) and isinstance(
            position.get("y"), (int, float)
        ):
            items.append(
                {
                    "entity": row["entity"],
                    "id": row["id"],
                    "x": round(position["x"]),
                    "y": round(position["y"]),
                }
            )
    now = utc_now()
    _put_record(
        conn,
        "investigationBoards",
        "board_main",
        _default_board(items),
        now,
        now,
    )


def _migrate_v6_remove_visibility(conn: sqlite3.Connection) -> None:
    removals = {
        "events": {"knownByIds"},
        "facts": {"knownByIds", "unknownByIds"},
        "clues": {"knownByIds"},
    }
    now = utc_now()
    for entity, keys in removals.items():
        for row in conn.execute(
            "SELECT * FROM records WHERE entity=?", (entity,)
        ).fetchall():
            payload = json.loads(row["data"])
            if not keys.intersection(payload):
                continue
            for key in keys:
                payload.pop(key, None)
            _put_record(conn, entity, row["id"], payload, row["created_at"], now)


def _find_relationship(
    conn: sqlite3.Connection,
    source_type: str,
    source_id: str,
    target_type: str,
    target_id: str,
) -> sqlite3.Row | None:
    return conn.execute(
        """
        SELECT * FROM relationships
        WHERE (source_type=? AND source_id=? AND target_type=? AND target_id=?)
           OR (source_type=? AND source_id=? AND target_type=? AND target_id=?)
        LIMIT 1
        """,
        (
            source_type,
            source_id,
            target_type,
            target_id,
            target_type,
            target_id,
            source_type,
            source_id,
        ),
    ).fetchone()


def _ensure_relationship(
    conn: sqlite3.Connection,
    source_type: str,
    source_id: str,
    target_type: str,
    target_id: str,
    label: str,
) -> None:
    if not source_id or not target_id or _find_relationship(
        conn, source_type, source_id, target_type, target_id
    ):
        return
    now = utc_now()
    conn.execute(
        """
        INSERT INTO relationships(
            id, source_type, source_id, target_type, target_id,
            relation_label, notes, edge_color, arrow_direction, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, '', '', '', ?, ?)
        """,
        (
            f"rel_{secrets.token_hex(8)}",
            source_type,
            source_id,
            target_type,
            target_id,
            label,
            now,
            now,
        ),
    )


def _migrate_v7_canonical_relationships(conn: sqlite3.Connection) -> None:
    for row in conn.execute("SELECT * FROM records ORDER BY created_at").fetchall():
        entity = row["entity"]
        record_id = row["id"]
        payload = json.loads(row["data"])
        if entity == "coteries":
            for character_id in payload.get("memberIds") or []:
                _ensure_relationship(conn, entity, record_id, "characters", character_id, "член")
        elif entity == "characters":
            if payload.get("coterieId"):
                _ensure_relationship(conn, "coteries", payload["coterieId"], entity, record_id, "член")
            if payload.get("factionId"):
                _ensure_relationship(conn, "factions", payload["factionId"], entity, record_id, "член")
        elif entity == "factions":
            for character_id in payload.get("memberIds") or []:
                _ensure_relationship(conn, entity, record_id, "characters", character_id, "член")
            for faction_id in payload.get("allyIds") or []:
                _ensure_relationship(conn, entity, record_id, entity, faction_id, "союзник")
            for faction_id in payload.get("enemyIds") or []:
                _ensure_relationship(conn, entity, record_id, entity, faction_id, "враг")
        elif entity == "events":
            for character_id in payload.get("participantIds") or []:
                _ensure_relationship(conn, entity, record_id, "characters", character_id, "участник")


def _migrate_v8_graph_layout(conn: sqlite3.Connection) -> None:
    if conn.execute(
        "SELECT 1 FROM records WHERE entity='graphLayouts' AND id='graph_main'"
    ).fetchone():
        return
    nodes: list[dict[str, Any]] = []
    rows = conn.execute(
        "SELECT entity,id,data FROM records WHERE entity NOT IN ('campaigns','investigationBoards','graphLayouts') ORDER BY created_at"
    ).fetchall()
    for row in rows:
        payload = json.loads(row["data"])
        position = payload.get("graphPosition")
        has_position = isinstance(position, dict) and isinstance(
            position.get("x"), (int, float)
        ) and isinstance(position.get("y"), (int, float))
        has_style = any(
            payload.get(key)
            for key in ("graphNodeColor", "graphTextColor", "graphNodeScale")
        )
        if not has_position and not has_style:
            continue
        nodes.append(
            {
                "entity": row["entity"],
                "id": row["id"],
                "x": float(position.get("x", 0)) if has_position else 0,
                "y": float(position.get("y", 0)) if has_position else 0,
                "scale": float(payload.get("graphNodeScale", 1) or 1),
                "pinned": has_position,
                "color": str(payload.get("graphNodeColor", "") or ""),
                "textColor": str(payload.get("graphTextColor", "") or ""),
                "borderColor": "",
            }
        )
    now = utc_now()
    _put_record(
        conn,
        "graphLayouts",
        "graph_main",
        {
            "name": "Основной граф",
            "nodes": nodes,
            "viewport": {"x": 0, "y": 0, "zoom": 1},
            "filters": {},
        },
        now,
        now,
    )


def _migrate_v9_three_dimensional_graph(conn: sqlite3.Connection) -> None:
    rows = conn.execute(
        "SELECT id,data,created_at FROM records WHERE entity='graphLayouts'"
    ).fetchall()
    for row in rows:
        payload = json.loads(row["data"])
        filters = payload.get("filters") if isinstance(payload.get("filters"), dict) else {}
        nodes = payload.get("nodes") if isinstance(payload.get("nodes"), list) else []
        if filters.get("spaceVersion") != 3:
            for index, node in enumerate(nodes):
                if not isinstance(node, dict):
                    continue
                old_x = float(node.get("x", 550) or 0)
                old_y = float(node.get("y", 320) or 0)
                node["x"] = (old_x - 550) / 3
                node["y"] = (320 - old_y) / 3
                key = f'{node.get("entity", "")}:{node.get("id", index)}'
                node["z"] = ((sum(ord(char) for char in key) % 9) - 4) * 24
        payload["nodes"] = nodes
        payload["camera"] = payload.get("camera") or {
            "position": {"x": 0, "y": 40, "z": 520},
            "target": {"x": 0, "y": 0, "z": 0},
        }
        payload["mode"] = payload.get("mode") or "custom"
        filters["spaceVersion"] = 3
        payload["filters"] = filters
        now = utc_now()
        _put_record(
            conn,
            "graphLayouts",
            row["id"],
            payload,
            row["created_at"],
            now,
        )


def _migrate_v10_two_dimensional_graph(conn: sqlite3.Connection) -> None:
    rows = conn.execute(
        "SELECT id,data,created_at FROM records WHERE entity='graphLayouts'"
    ).fetchall()
    for row in rows:
        payload = json.loads(row["data"])
        filters = payload.get("filters") if isinstance(payload.get("filters"), dict) else {}
        nodes = payload.get("nodes") if isinstance(payload.get("nodes"), list) else []
        if filters.get("spaceVersion") == 3:
            for node in nodes:
                if not isinstance(node, dict):
                    continue
                node["x"] = float(node.get("x", 0) or 0) * 3 + 550
                node["y"] = 320 - float(node.get("y", 0) or 0) * 3
                node.pop("z", None)
        payload["nodes"] = nodes
        payload["viewport"] = payload.get("viewport") or {"x": 0, "y": 0, "zoom": 1}
        payload["mode"] = "obsidian" if payload.get("mode") == "free" else payload.get("mode", "custom")
        payload.pop("camera", None)
        filters["spaceVersion"] = 2
        payload["filters"] = filters
        now = utc_now()
        _put_record(conn, "graphLayouts", row["id"], payload, row["created_at"], now)


def _default_graph_mode_style(mode: str) -> dict[str, Any]:
    return {
        "fontFamily": "Inter, ui-sans-serif, system-ui, sans-serif",
        "labelSize": 13 if mode == "custom" else 11,
        "labelWeight": 600 if mode == "custom" else 500,
        "labelItalic": False,
        "labelOutline": True,
        "edgeLabels": True,
        "edgeLabelSize": 11 if mode == "custom" else 9,
        "backgroundColor": "#090b0f",
        "gridColor": "#28303b",
        "gridOpacity": 0.38 if mode == "custom" else 0.18,
        "edgeColor": "#c8a85a",
        "edgeWidth": 1.6 if mode == "custom" else 1.0,
        "edgeOpacity": 0.78 if mode == "custom" else 0.5,
        "nodeScale": 1,
        "physics": {
            "centerForce": 0,
            "repelForce": 1,
            "linkForce": 1,
            "linkDistance": 155 if mode == "custom" else 78,
        },
        "entityTypeStyles": {},
    }


def _migrate_v11_knowledge_metadata(conn: sqlite3.Connection) -> None:
    now = utc_now()
    for row in conn.execute(
        "SELECT * FROM records WHERE entity IN ('characters','factions')"
    ).fetchall():
        payload = json.loads(row["data"])
        if row["entity"] == "characters" and payload.get("characterType") == "Игровой персонаж":
            continue
        system_tags = [
            item for item in payload.get("systemTags", [])
            if isinstance(item, dict) and item.get("namespace") != "coterie-disposition"
        ]
        system_tags.append(
            {
                "namespace": "coterie-disposition",
                "value": "unknown",
                "label": "Неизвестно",
                "color": "#737982",
            }
        )
        payload["systemTags"] = system_tags
        _put_record(conn, row["entity"], row["id"], payload, row["created_at"], now)

    for row in conn.execute(
        "SELECT * FROM records WHERE entity='graphLayouts'"
    ).fetchall():
        payload = json.loads(row["data"])
        mode_styles = payload.get("modeStyles") if isinstance(payload.get("modeStyles"), dict) else {}
        mode_styles.setdefault("custom", _default_graph_mode_style("custom"))
        mode_styles.setdefault("obsidian", _default_graph_mode_style("obsidian"))
        payload["modeStyles"] = mode_styles
        _put_record(conn, row["entity"], row["id"], payload, row["created_at"], now)


def _migrate_v12_semantic_graph_colors(conn: sqlite3.Connection) -> None:
    now = utc_now()
    disposition_colors = {"neutral": "#737982", "unknown": "#f4f4f2"}
    for row in conn.execute(
        "SELECT * FROM records WHERE entity IN ('characters','factions')"
    ).fetchall():
        payload = json.loads(row["data"])
        changed = False
        system_tags = payload.get("systemTags", [])
        if not isinstance(system_tags, list):
            system_tags = []
        is_player = row["entity"] == "characters" and payload.get("characterType") == "Игровой персонаж"
        disposition_found = False
        for tag in system_tags:
            if not isinstance(tag, dict) or tag.get("namespace") != "coterie-disposition":
                continue
            disposition_found = True
            color = disposition_colors.get(tag.get("value"))
            if color and tag.get("color") != color:
                tag["color"] = color
                changed = True
        if not is_player and not disposition_found:
            system_tags.append(
                {
                    "namespace": "coterie-disposition",
                    "value": "unknown",
                    "label": "Неизвестно",
                    "color": "#f4f4f2",
                }
            )
            payload["systemTags"] = system_tags
            changed = True
        if changed:
            _put_record(conn, row["entity"], row["id"], payload, row["created_at"], now)

    for row in conn.execute("SELECT * FROM records WHERE entity='graphLayouts'").fetchall():
        payload = json.loads(row["data"])
        changed = False
        for node in payload.get("nodes", []):
            if isinstance(node, dict) and node.get("entity") == "coteries" and node.get("color") == "#441923":
                node.pop("color", None)
                changed = True
        if changed:
            _put_record(conn, row["entity"], row["id"], payload, row["created_at"], now)

    conn.execute(
        "UPDATE relationships SET edge_color='#b23a48', updated_at=? WHERE lower(relation_label) IN ('враг','enemy') AND edge_color IN ('','#c8a85a')",
        (now,),
    )
    conn.execute(
        "UPDATE relationships SET edge_color='#2f8f5b', updated_at=? WHERE lower(relation_label) IN ('союзник','ally') AND edge_color IN ('','#c8a85a')",
        (now,),
    )


def _migrate_v13_structured_tags(conn: sqlite3.Connection) -> None:
    now = utc_now()
    fields_by_entity = {
        "characters": ("characterType", "species", "vampireClan", "garouTribe", "status"),
        "locations": ("level", "parentCityId"),
        "events": ("cityId", "placeId"),
        "facts": ("reliability", "eventId"),
        "clues": ("reliability", "eventId", "discoveredByIds"),
        "storylines": ("status",),
        "theories": ("authorId", "status"),
        "notes": ("authorId",),
        "memoirs": ("authorId", "eventIds", "characterIds"),
    }
    placeholders = ",".join("?" for _ in fields_by_entity)
    for row in conn.execute(
        f"SELECT * FROM records WHERE entity IN ({placeholders})",
        tuple(fields_by_entity),
    ).fetchall():
        payload = json.loads(row["data"])
        fields = fields_by_entity[row["entity"]]
        existing = [item for item in payload.get("systemTags", []) if isinstance(item, dict)]
        previous = {
            (str(item.get("namespace", "")), str(item.get("value", ""))): item
            for item in existing
        }
        controlled = {f"field:{key}" for key in fields}
        system_tags = [item for item in existing if item.get("namespace") not in controlled]
        for key in fields:
            if key == "vampireClan" and payload.get("species") != "Вампир":
                continue
            if key == "garouTribe" and payload.get("species") != "Гару":
                continue
            raw = payload.get(key)
            values = raw if isinstance(raw, list) else [raw]
            namespace = f"field:{key}"
            for value in values:
                normalized = str(value or "").strip()
                if not normalized:
                    continue
                old = previous.get((namespace, normalized), {})
                system_tags.append(
                    {
                        "namespace": namespace,
                        "value": normalized,
                        "label": str(old.get("label") or normalized),
                        "color": str(old.get("color") or ""),
                    }
                )
        payload["systemTags"] = system_tags
        _put_record(conn, row["entity"], row["id"], payload, row["created_at"], now)


def _migrate_v14_relationship_lines(conn: sqlite3.Connection) -> None:
    columns = {
        row["name"] for row in conn.execute("PRAGMA table_info(relationships)").fetchall()
    }
    if "line_style" not in columns:
        conn.execute(
            "ALTER TABLE relationships ADD COLUMN line_style TEXT NOT NULL DEFAULT 'solid'"
        )
    now = utc_now()
    conn.execute(
        "UPDATE relationships SET edge_color='#737982', updated_at=? WHERE edge_color IN ('','#c8a85a') AND lower(relation_label) NOT IN ('враг','enemy','союзник','ally')",
        (now,),
    )


def _migrate_v15_location_relationships(conn: sqlite3.Connection) -> None:
    for row in conn.execute("SELECT id,data FROM records WHERE entity='locations'").fetchall():
        payload = json.loads(row["data"])
        parent_city_id = str(payload.get("parentCityId") or "")
        if parent_city_id:
            _ensure_relationship(
                conn, "locations", row["id"], "locations", parent_city_id, "находится в"
            )

MIGRATIONS = {
    2: _migrate_v2_coterie,
    3: _migrate_v3_dedupe_relationships,
    4: _migrate_v4_relationship_styles,
    5: _migrate_v5_investigation_boards,
    6: _migrate_v6_remove_visibility,
    7: _migrate_v7_canonical_relationships,
    8: _migrate_v8_graph_layout,
    9: _migrate_v9_three_dimensional_graph,
    10: _migrate_v10_two_dimensional_graph,
    11: _migrate_v11_knowledge_metadata,
    12: _migrate_v12_semantic_graph_colors,
    13: _migrate_v13_structured_tags,
    14: _migrate_v14_relationship_lines,
    15: _migrate_v15_location_relationships,
}


def initialize_database(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS records (
            entity TEXT NOT NULL,
            id TEXT NOT NULL,
            data TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (entity, id)
        );
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
            line_style TEXT NOT NULL DEFAULT 'solid',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
            token_hash TEXT PRIMARY KEY,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        """
    )
    row = conn.execute(
        "SELECT value FROM settings WHERE key='seed_version'"
    ).fetchone()
    if not row:
        _seed_initial_data(conn)
        version = 1
        conn.execute(
            "INSERT OR REPLACE INTO settings(key,value) VALUES('seed_version','1')"
        )
    else:
        version = int(row["value"])
    for target_version, migration in MIGRATIONS.items():
        if version >= target_version:
            continue
        migration(conn)
        version = target_version
        conn.execute(
            "INSERT OR REPLACE INTO settings(key,value) VALUES('seed_version',?)",
            (str(version),),
        )
    conn.commit()
