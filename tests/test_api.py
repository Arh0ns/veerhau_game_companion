from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from chronicle.config import Settings
from chronicle.presentation.api import create_app


@pytest.fixture
def client(tmp_path: Path) -> TestClient:
    settings = Settings(
        root=tmp_path,
        data_dir=tmp_path,
        static_dir=tmp_path / "missing-static",
        database_path=tmp_path / "chronicle.db",
        password="test-password",
        session_days=30,
        host="127.0.0.1",
        port=8787,
    )
    return TestClient(create_app(settings))


def login(client: TestClient) -> None:
    response = client.post("/api/v1/session", json={"password": "test-password"})
    assert response.status_code == 200


def test_data_is_protected_by_password(client: TestClient) -> None:
    assert client.get("/api/v1/bootstrap").status_code == 401
    assert client.post("/api/v1/session", json={"password": "wrong"}).status_code == 400
    login(client)
    snapshot = client.get("/api/v1/bootstrap")
    assert snapshot.status_code == 200
    assert len(snapshot.json()["characters"]) == 4


def test_crud_works_in_v1_and_legacy_api(client: TestClient) -> None:
    login(client)
    created = client.post(
        "/api/v1/records/facts",
        json={"statement": "Свидетель видел чёрный автомобиль", "legacy": 17},
    )
    assert created.status_code == 201
    fact = created.json()

    updated = client.put(
        f"/api/facts/{fact['id']}",
        json={"reliability": "Вероятно"},
    )
    assert updated.status_code == 200
    assert updated.json()["legacy"] == 17
    assert updated.json()["reliability"] == "Вероятно"

    assert client.delete(f"/api/v1/records/facts/{fact['id']}").status_code == 200
    assert client.get(f"/api/facts/{fact['id']}").status_code == 404


def test_relationship_upsert_keeps_one_pair(client: TestClient) -> None:
    login(client)
    first = client.post("/api/v1/records/facts", json={"statement": "A"}).json()
    second = client.post("/api/v1/records/clues", json={"title": "B"}).json()
    payload = {
        "sourceType": "facts",
        "sourceId": first["id"],
        "targetType": "clues",
        "targetId": second["id"],
        "relationLabel": "подтверждает",
    }
    created = client.post("/api/v1/relationships", json=payload)
    assert created.status_code == 201

    reversed_payload = {
        **payload,
        "sourceType": "clues",
        "sourceId": second["id"],
        "targetType": "facts",
        "targetId": first["id"],
        "relationLabel": "опровергает",
    }
    updated = client.post("/api/v1/relationships", json=reversed_payload)
    assert updated.status_code == 200
    assert updated.json()["id"] == created.json()["id"]
    assert updated.json()["relationLabel"] == "опровергает"
    assert len(client.get("/api/v1/relationships").json()) == 5


def test_board_rejects_duplicate_nodes(client: TestClient) -> None:
    login(client)
    payload = {
        "name": "Проверка",
        "items": [
            {"entity": "characters", "id": "chr_julia"},
            {"entity": "characters", "id": "chr_julia"},
        ],
    }
    response = client.post("/api/v1/boards", json=payload)
    assert response.status_code == 400
    assert "дважды" in response.json()["error"]


def test_coterie_disposition_is_system_metadata_not_relationship(client: TestClient) -> None:
    login(client)
    before = len(client.get("/api/v1/relationships").json())
    created = client.post(
        "/api/v1/records/characters",
        json={
            "name": "Наблюдатель",
            "characterType": "NPC",
            "systemTags": [
                {
                    "namespace": "coterie-disposition",
                    "value": "ally",
                    "label": "",
                    "color": "",
                }
            ],
        },
    )
    assert created.status_code == 201
    disposition = next(
        tag for tag in created.json()["systemTags"]
        if tag["namespace"] == "coterie-disposition"
    )
    assert disposition == {
        "namespace": "coterie-disposition",
        "value": "ally",
        "label": "Союзник",
        "color": "#2f8f5b",
    }
    assert len(client.get("/api/v1/relationships").json()) == before


def test_structured_system_tags_round_trip_on_other_entities(client: TestClient) -> None:
    login(client)
    created = client.post(
        "/api/v1/records/locations",
        json={
            "name": "Архив",
            "level": "Место в городе",
        },
    )
    assert created.status_code == 201
    level_tag = next(
        tag for tag in created.json()["systemTags"]
        if tag["namespace"] == "field:level"
    )
    assert level_tag["value"] == "Место в городе"


def test_relationships_get_semantic_default_colors(client: TestClient) -> None:
    login(client)
    first = client.post("/api/v1/records/factions", json={"name": "Первый дом"}).json()
    second = client.post("/api/v1/records/factions", json={"name": "Второй дом"}).json()
    response = client.post(
        "/api/v1/relationships",
        json={
            "sourceType": "factions",
            "sourceId": first["id"],
            "targetType": "factions",
            "targetId": second["id"],
            "relationLabel": "враг",
            "lineStyle": "dashed",
        },
    )
    assert response.status_code == 201
    assert response.json()["edgeColor"] == "#b23a48"
    assert response.json()["lineStyle"] == "dashed"

    fact = client.post("/api/v1/records/facts", json={"statement": "Серый"}).json()
    clue = client.post("/api/v1/records/clues", json={"title": "Контур"}).json()
    generic = client.post(
        "/api/v1/relationships",
        json={
            "sourceType": "facts",
            "sourceId": fact["id"],
            "targetType": "clues",
            "targetId": clue["id"],
            "relationLabel": "связано",
        },
    )
    assert generic.json()["edgeColor"] == "#737982"
    assert generic.json()["lineStyle"] == "solid"


def test_mention_dismissals_are_persisted_as_support_records(client: TestClient) -> None:
    login(client)
    created = client.post(
        "/api/v1/records/mentionDismissals",
        json={
            "pairKey": "facts:a|characters:b",
            "sourceType": "facts",
            "sourceId": "a",
            "targetType": "characters",
            "targetId": "b",
        },
    )
    assert created.status_code == 201
    snapshot = client.get("/api/v1/bootstrap").json()
    assert snapshot["mentionDismissals"][0]["pairKey"] == "facts:a|characters:b"


def test_tags_are_normalized_and_can_be_renamed_or_merged(client: TestClient) -> None:
    login(client)
    first = client.post(
        "/api/v1/records/facts",
        json={"statement": "Первый", "tags": ["#Город/Прага", "улика"]},
    ).json()
    second = client.post(
        "/api/v1/records/clues",
        json={"title": "Вторая", "tags": ["город/прага", "ночь"]},
    ).json()
    assert first["tags"] == ["город/прага", "улика"]
    assert second["tags"] == ["город/прага", "ночь"]
    tags = {item["name"]: item["count"] for item in client.get("/api/v1/tags").json()}
    assert tags["город/прага"] == 2

    renamed = client.post(
        "/api/v1/tags/rename",
        json={"source": "ночь", "target": "время/ночь"},
    )
    assert renamed.status_code == 200
    merged = client.post(
        "/api/v1/tags/merge",
        json={"source": "улика", "target": "время/ночь"},
    )
    assert merged.status_code == 200
    assert client.get(f"/api/v1/records/facts/{first['id']}").json()["tags"] == ["город/прага", "время/ночь"]


def test_parent_tag_rename_updates_its_nested_tags(client: TestClient) -> None:
    login(client)
    fact = client.post(
        "/api/v1/records/facts",
        json={"statement": "Nested tag", "tags": ["place/prague", "place/vienna/night"]},
    ).json()

    response = client.post(
        "/api/v1/tags/rename",
        json={"source": "place", "target": "location"},
    )

    assert response.status_code == 200
    assert client.get(f"/api/v1/records/facts/{fact['id']}").json()["tags"] == [
        "location/prague",
        "location/vienna/night",
    ]
