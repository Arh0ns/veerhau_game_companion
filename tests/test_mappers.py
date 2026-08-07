from __future__ import annotations

import pytest

from chronicle.domain.models import EntityType, RecordEnvelope
from chronicle.infrastructure.mappers import create_default_mapper_registry


@pytest.mark.parametrize("entity_type", list(EntityType))
def test_every_entity_has_lossless_mapper(entity_type: EntityType) -> None:
    registry = create_default_mapper_registry()
    envelope = RecordEnvelope(
        entity_type=entity_type,
        id="example_1",
        payload={"legacyField": {"kept": True}},
        created_at="2026-01-01T00:00:00+00:00",
        updated_at="2026-01-02T00:00:00+00:00",
    )

    entity = registry.from_record(envelope)
    restored = registry.to_record(entity)

    assert restored.entity_type is entity_type
    assert restored.id == envelope.id
    assert restored.payload["legacyField"] == {"kept": True}


def test_character_classification_and_abilities_round_trip() -> None:
    registry = create_default_mapper_registry()
    envelope = RecordEnvelope(
        entity_type=EntityType.CHARACTERS,
        id="npc_1",
        payload={"name": "Свидетель", "importance": "Высокая", "knownAbilities": ["Прорицание"]},
        created_at="2026-01-01T00:00:00+00:00",
        updated_at="2026-01-01T00:00:00+00:00",
    )
    restored = registry.to_record(registry.from_record(envelope)).payload
    assert restored["importance"] == "Высокая"
    assert restored["knownAbilities"] == ["Прорицание"]


def test_artifact_owner_and_description_round_trip() -> None:
    registry = create_default_mapper_registry()
    envelope = RecordEnvelope(
        entity_type=EntityType.ARTIFACTS,
        id="artifact_1",
        payload={"title": "Серебряный ключ", "ownerId": "npc_1", "description": "Открывает запечатанную дверь."},
        created_at="2026-01-01T00:00:00+00:00",
        updated_at="2026-01-01T00:00:00+00:00",
    )
    restored = registry.to_record(registry.from_record(envelope)).payload
    assert restored["ownerId"] == "npc_1"
    assert restored["description"] == "Открывает запечатанную дверь."


def test_graph_node_border_style_round_trip() -> None:
    registry = create_default_mapper_registry()
    envelope = RecordEnvelope(
        entity_type=EntityType.GRAPH_LAYOUTS,
        id="graph_1",
        payload={
            "name": "Основной граф",
            "nodes": [{
                "entity": "characters",
                "id": "npc_1",
                "x": 10,
                "y": 20,
                "borderColor": "#abcdef",
                "borderStyle": "dotted",
                "borderWidth": 4.5,
            }],
        },
        created_at="2026-01-01T00:00:00+00:00",
        updated_at="2026-01-01T00:00:00+00:00",
    )
    node = registry.to_record(registry.from_record(envelope)).payload["nodes"][0]
    assert node["borderStyle"] == "dotted"
    assert node["borderWidth"] == 4.5
