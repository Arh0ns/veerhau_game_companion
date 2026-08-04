from __future__ import annotations

import shutil
import sqlite3
import json
from pathlib import Path

from chronicle.infrastructure.sqlite import SQLiteDatabase


def test_real_database_copy_migrates_without_record_loss(tmp_path: Path) -> None:
    source = Path(__file__).resolve().parents[1] / "data" / "chronicle.db"
    target = tmp_path / "chronicle.db"
    shutil.copy2(source, target)

    legacy = sqlite3.connect(target)
    legacy.row_factory = sqlite3.Row
    legacy.execute("UPDATE settings SET value='16' WHERE key='seed_version'")
    for row in legacy.execute(
        "SELECT entity,id,data FROM records WHERE entity IN ('characters','events','facts')"
    ).fetchall():
        payload = json.loads(row["data"])
        payload.pop("importance", None)
        payload["systemTags"] = [
            tag for tag in payload.get("systemTags", [])
            if not isinstance(tag, dict) or tag.get("namespace") != "field:importance"
        ]
        legacy.execute(
            "UPDATE records SET data=? WHERE entity=? AND id=?",
            (json.dumps(payload, ensure_ascii=False), row["entity"], row["id"]),
        )
    legacy.commit()
    legacy.close()

    before = sqlite3.connect(target)
    record_count = before.execute("SELECT count(1) FROM records").fetchone()[0]
    relationship_count = before.execute("SELECT count(1) FROM relationships").fetchone()[0]
    existing_pairs = {
        frozenset(((row[0], row[1]), (row[2], row[3])))
        for row in before.execute(
            "SELECT source_type, source_id, target_type, target_id FROM relationships"
        ).fetchall()
    }
    missing_location_pairs = set()
    for record_id, raw_data in before.execute(
        "SELECT id, data FROM records WHERE entity='locations'"
    ).fetchall():
        parent_id = str(json.loads(raw_data).get("parentCityId") or "").strip()
        if parent_id:
            pair = frozenset((("locations", record_id), ("locations", parent_id)))
            if pair not in existing_pairs:
                missing_location_pairs.add(pair)
    graph_layout_count_before = before.execute(
        "SELECT count(1) FROM records WHERE entity='graphLayouts'"
    ).fetchone()[0]
    before.close()

    SQLiteDatabase(target).initialize()

    after = sqlite3.connect(target)
    version = int(
        after.execute("SELECT value FROM settings WHERE key='seed_version'").fetchone()[0]
    )
    migrated_record_count = after.execute("SELECT count(1) FROM records").fetchone()[0]
    migrated_relationship_count = after.execute(
        "SELECT count(1) FROM relationships"
    ).fetchone()[0]
    graph_layout_count = after.execute(
        "SELECT count(1) FROM records WHERE entity='graphLayouts'"
    ).fetchone()[0]
    after.close()

    assert version == 18
    assert migrated_record_count == record_count + (0 if graph_layout_count_before else 1)
    assert migrated_relationship_count == relationship_count + len(missing_location_pairs)
    assert graph_layout_count == 1

    migrated = sqlite3.connect(target)
    migrated.row_factory = sqlite3.Row
    npc_and_factions = migrated.execute(
        "SELECT entity,data FROM records WHERE entity IN ('characters','factions')"
    ).fetchall()
    graph_payload = migrated.execute(
        "SELECT data FROM records WHERE entity='graphLayouts' LIMIT 1"
    ).fetchone()
    relationship_columns = {
        row[1] for row in migrated.execute("PRAGMA table_info(relationships)").fetchall()
    }
    structured_character_tag_found = False
    for row in npc_and_factions:
        payload = json.loads(row["data"])
        if row["entity"] == "characters" and any(
            tag.get("namespace") == "field:characterType"
            for tag in payload.get("systemTags", [])
        ):
            structured_character_tag_found = True
        if row["entity"] == "characters" and payload.get("characterType") == "Игровой персонаж":
            continue
        disposition = next(
            (
                tag for tag in payload.get("systemTags", [])
                if tag.get("namespace") == "coterie-disposition"
            ),
            None,
        )
        assert disposition is not None
        assert disposition.get("value") in {"ally", "enemy", "neutral", "unknown", "custom"}
        if disposition.get("value") == "neutral":
            assert disposition.get("color") == "#737982"
        if disposition.get("value") == "unknown":
            assert disposition.get("color") == "#f4f4f2"
    assert structured_character_tag_found
    assert "line_style" in relationship_columns
    assert set(json.loads(graph_payload["data"])["modeStyles"]) == {"custom", "obsidian"}
    mode_layouts = json.loads(graph_payload["data"])["modeLayouts"]
    assert set(mode_layouts) == {"custom", "obsidian"}
    assert mode_layouts["custom"] is not mode_layouts["obsidian"]
    for mode_style in json.loads(graph_payload["data"])["modeStyles"].values():
        for key, style in mode_style.get("entityTypeStyles", {}).items():
            if key.startswith("importance="):
                assert not {"color", "textColor", "fontFamily", "labelSize", "labelWeight"}.intersection(style)
    classified = migrated.execute(
        "SELECT entity,data FROM records WHERE entity IN ('coteries','characters','factions','locations','events','facts','clues','storylines','theories','notes')"
    ).fetchall()
    assert classified
    for row in classified:
        payload = json.loads(row["data"])
        assert payload["importance"] in {"Высокая", "Обычная", "Низкая"}
        assert any(
            tag.get("namespace") == "field:importance" and tag.get("value") == payload["importance"]
            for tag in payload.get("systemTags", [])
        )
    migrated.close()
