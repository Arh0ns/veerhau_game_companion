from __future__ import annotations

from dataclasses import fields
from typing import Any, Callable, Generic, TypeVar

from chronicle.domain.models import (
    BoardGroup,
    BoardNode,
    BoardNote,
    Bookmark,
    Campaign,
    Character,
    ChronicleEntity,
    ChronicleEvent,
    Clue,
    Coterie,
    EntityRef,
    EntityTemplate,
    EntityType,
    Fact,
    Faction,
    GraphLayout,
    GraphNodePlacement,
    InvestigationBoard,
    Location,
    Memoir,
    MentionDismissal,
    NodeStyle,
    RecordEnvelope,
    Storyline,
    SavedSearch,
    SystemTag,
    TagDefinition,
    Theory,
    Viewport,
)


TEntity = TypeVar("TEntity", bound=ChronicleEntity)


class RecordMapper(Generic[TEntity]):
    def from_record(self, envelope: RecordEnvelope) -> TEntity:
        raise NotImplementedError

    def to_record(self, entity: TEntity) -> RecordEnvelope:
        raise NotImplementedError


class DataclassRecordMapper(RecordMapper[TEntity]):
    def __init__(
        self,
        entity_class: type[TEntity],
        aliases: dict[str, str],
        *,
        readers: dict[str, Callable[[Any], Any]] | None = None,
        writers: dict[str, Callable[[Any], Any]] | None = None,
    ) -> None:
        self.entity_class = entity_class
        self.aliases = aliases
        self.readers = readers or {}
        self.writers = writers or {}

    def from_record(self, envelope: RecordEnvelope) -> TEntity:
        payload = dict(envelope.payload)
        values: dict[str, Any] = {
            "id": envelope.id,
            "created_at": envelope.created_at,
            "updated_at": envelope.updated_at,
        }
        for attribute, payload_key in self.aliases.items():
            if payload_key not in payload:
                continue
            value = payload.pop(payload_key)
            reader = self.readers.get(attribute)
            values[attribute] = reader(value) if reader else value
        values["extra"] = payload
        return self.entity_class(**values)

    def to_record(self, entity: TEntity) -> RecordEnvelope:
        payload = dict(entity.extra)
        available_fields = {item.name for item in fields(entity)}
        for attribute, payload_key in self.aliases.items():
            if attribute not in available_fields:
                continue
            value = getattr(entity, attribute)
            writer = self.writers.get(attribute)
            payload[payload_key] = writer(value) if writer else value
        return RecordEnvelope(
            entity_type=entity.entity_type,
            id=entity.id,
            payload=payload,
            created_at=entity.created_at,
            updated_at=entity.updated_at,
        )


def _viewport_from_json(value: Any) -> Viewport:
    value = value if isinstance(value, dict) else {}
    return Viewport(
        x=float(value.get("x", 0) or 0),
        y=float(value.get("y", 0) or 0),
        zoom=float(value.get("zoom", 1) or 1),
    )


def _viewport_to_json(value: Viewport) -> dict[str, float]:
    return {"x": value.x, "y": value.y, "zoom": value.zoom}


def _node_style_from_json(value: dict[str, Any]) -> NodeStyle:
    return NodeStyle(
        color=str(value.get("color", "") or ""),
        text_color=str(value.get("textColor", "") or ""),
        border_color=str(value.get("borderColor", "") or ""),
    )


def _system_tags_from_json(value: Any) -> list[SystemTag]:
    if not isinstance(value, list):
        return []
    result: list[SystemTag] = []
    for item in value:
        if not isinstance(item, dict) or not item.get("namespace"):
            continue
        result.append(
            SystemTag(
                namespace=str(item.get("namespace", "")),
                value=str(item.get("value", "")),
                label=str(item.get("label", "")),
                color=str(item.get("color", "")),
            )
        )
    return result


def _system_tags_to_json(value: list[SystemTag]) -> list[dict[str, str]]:
    return [
        {
            "namespace": item.namespace,
            "value": item.value,
            "label": item.label,
            "color": item.color,
        }
        for item in value
    ]


def _board_nodes_from_json(value: Any) -> list[BoardNode]:
    if not isinstance(value, list):
        return []
    result: list[BoardNode] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        try:
            ref = EntityRef(EntityType(str(item.get("entity", ""))), str(item.get("id", "")))
        except ValueError:
            continue
        if not ref.entity_id:
            continue
        result.append(
            BoardNode(
                entity=ref,
                x=float(item.get("x", 0) or 0),
                y=float(item.get("y", 0) or 0),
                width=float(item.get("width", 280) or 280),
                height=float(item.get("height", 170) or 170),
                style=_node_style_from_json(item),
            )
        )
    return result


def _board_nodes_to_json(value: list[BoardNode]) -> list[dict[str, Any]]:
    return [
        {
            "entity": item.entity.entity_type.value,
            "id": item.entity.entity_id,
            "x": item.x,
            "y": item.y,
            "width": item.width,
            "height": item.height,
            "color": item.style.color,
            "textColor": item.style.text_color,
            "borderColor": item.style.border_color,
        }
        for item in value
    ]


def _board_groups_from_json(value: Any) -> list[BoardGroup]:
    if not isinstance(value, list):
        return []
    result: list[BoardGroup] = []
    for item in value:
        if not isinstance(item, dict) or not item.get("id"):
            continue
        result.append(
            BoardGroup(
                id=str(item["id"]),
                name=str(item.get("name", "Группа")),
                x=float(item.get("x", 0) or 0),
                y=float(item.get("y", 0) or 0),
                width=float(item.get("width", 640) or 640),
                height=float(item.get("height", 420) or 420),
                color=str(item.get("color", "") or ""),
                border_color=str(item.get("borderColor", "") or ""),
                border_style=str(item.get("borderStyle", "dashed") or "dashed"),
            )
        )
    return result


def _board_groups_to_json(value: list[BoardGroup]) -> list[dict[str, Any]]:
    return [
        {
            "id": item.id,
            "name": item.name,
            "x": item.x,
            "y": item.y,
            "width": item.width,
            "height": item.height,
            "color": item.color,
            "borderColor": item.border_color,
            "borderStyle": item.border_style,
        }
        for item in value
    ]


def _graph_nodes_from_json(value: Any) -> list[GraphNodePlacement]:
    if not isinstance(value, list):
        return []
    result: list[GraphNodePlacement] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        try:
            ref = EntityRef(EntityType(str(item.get("entity", ""))), str(item.get("id", "")))
        except ValueError:
            continue
        result.append(
            GraphNodePlacement(
                entity=ref,
                x=float(item.get("x", 0) or 0),
                y=float(item.get("y", 0) or 0),
                scale=float(item.get("scale", 1) or 1),
                pinned=bool(item.get("pinned", False)),
                style=_node_style_from_json(item),
            )
        )
    return result


def _graph_nodes_to_json(value: list[GraphNodePlacement]) -> list[dict[str, Any]]:
    return [
        {
            "entity": item.entity.entity_type.value,
            "id": item.entity.entity_id,
            "x": item.x,
            "y": item.y,
            "scale": item.scale,
            "pinned": item.pinned,
            "color": item.style.color,
            "textColor": item.style.text_color,
            "borderColor": item.style.border_color,
        }
        for item in value
    ]


class RecordMapperRegistry:
    def __init__(self) -> None:
        self._mappers: dict[EntityType, RecordMapper[Any]] = {}

    def register(self, entity_type: EntityType, mapper: RecordMapper[Any]) -> None:
        self._mappers[entity_type] = mapper

    def mapper_for(self, entity_type: EntityType) -> RecordMapper[Any]:
        try:
            return self._mappers[entity_type]
        except KeyError as exc:
            raise ValueError(f"Для {entity_type.value} не зарегистрирован mapper") from exc

    def from_record(self, envelope: RecordEnvelope) -> ChronicleEntity:
        return self.mapper_for(envelope.entity_type).from_record(envelope)

    def to_record(self, entity: ChronicleEntity) -> RecordEnvelope:
        return self.mapper_for(entity.entity_type).to_record(entity)


COMMON = {
    "title": "title",
    "description": "description",
    "notes": "notes",
}


def create_default_mapper_registry() -> RecordMapperRegistry:
    registry = RecordMapperRegistry()
    metadata = {"tags": "tags", "aliases": "aliases"}
    definitions: list[tuple[EntityType, type[ChronicleEntity], dict[str, str]]] = [
        (EntityType.CAMPAIGNS, Campaign, {"title": "title", "description": "description", "setting": "setting"}),
        (EntityType.COTERIES, Coterie, {"name": "name", "description": "description", "goals": "goals", "haven": "haven", "notes": "notes", **metadata}),
        (EntityType.LOCATIONS, Location, {"name": "name", "level": "level", "parent_city_id": "parentCityId", "sect": "sect", "faction_id": "factionId", "description": "description", "notes": "notes", **metadata}),
        (EntityType.EVENTS, ChronicleEvent, {"title": "title", "description": "description", "game_date": "gameDate", "game_time": "gameTime", "city_id": "cityId", "place_id": "placeId", "consequence": "consequence", "notes": "notes", **metadata}),
        (EntityType.FACTS, Fact, {"statement": "statement", "source": "source", "reliability": "reliability", "event_id": "eventId", "attached_relationship_ids": "attachedRelationshipIds", "notes": "notes", **metadata}),
        (EntityType.CLUES, Clue, {"title": "title", "description": "description", "clue_type": "clueType", "source": "source", "reliability": "reliability", "event_id": "eventId", "discovered_by_ids": "discoveredByIds", "attached_relationship_ids": "attachedRelationshipIds", "notes": "notes", **metadata}),
        (EntityType.STORYLINES, Storyline, {"title": "title", "description": "description", "status": "status", "open_questions": "openQuestions", "notes": "notes", **metadata}),
        (EntityType.THEORIES, Theory, {"title": "title", "author_id": "authorId", "status": "status", "description": "description", "attached_relationship_ids": "attachedRelationshipIds", "notes": "notes", **metadata}),
        (EntityType.NOTES, BoardNote, {"title": "title", "author_id": "authorId", "text": "text", "attached_relationship_ids": "attachedRelationshipIds", "notes": "notes", **metadata}),
        (EntityType.MEMOIRS, Memoir, {"author_id": "authorId", "entry_date": "entryDate", "text": "text", "mood": "mood", "plans": "plans", "suspicions": "suspicions", "event_ids": "eventIds", "character_ids": "characterIds", "tags": "tags"}),
        (EntityType.TAG_DEFINITIONS, TagDefinition, {"name": "name", "description": "description", "recommended": "recommended"}),
        (EntityType.ENTITY_TEMPLATES, EntityTemplate, {"name": "name", "target_type": "targetType", "payload": "payload"}),
        (EntityType.SAVED_SEARCHES, SavedSearch, {"name": "name", "query": "query", "sort_by": "sortBy", "sort_direction": "sortDirection"}),
        (EntityType.BOOKMARKS, Bookmark, {"title": "title", "kind": "kind", "target": "target", "group": "group", "order": "order"}),
        (EntityType.MENTION_DISMISSALS, MentionDismissal, {"pair_key": "pairKey", "source_type": "sourceType", "source_id": "sourceId", "target_type": "targetType", "target_id": "targetId"}),
    ]
    for entity_type, entity_class, aliases in definitions:
        registry.register(entity_type, DataclassRecordMapper(entity_class, aliases))
    registry.register(
        EntityType.CHARACTERS,
        DataclassRecordMapper(
            Character,
            {"name": "name", "character_type": "characterType", "species": "species", "vampire_clan": "vampireClan", "garou_tribe": "garouTribe", "status": "status", "description": "description", "notes": "notes", "tags": "tags", "aliases": "aliases", "system_tags": "systemTags"},
            readers={"system_tags": _system_tags_from_json},
            writers={"system_tags": _system_tags_to_json},
        ),
    )
    registry.register(
        EntityType.FACTIONS,
        DataclassRecordMapper(
            Faction,
            {"name": "name", "faction_type": "factionType", "description": "description", "goals": "goals", "notes": "notes", "tags": "tags", "aliases": "aliases", "system_tags": "systemTags"},
            readers={"system_tags": _system_tags_from_json},
            writers={"system_tags": _system_tags_to_json},
        ),
    )
    registry.register(
        EntityType.INVESTIGATION_BOARDS,
        DataclassRecordMapper(
            InvestigationBoard,
            {"name": "name", "description": "description", "status": "status", "storyline_id": "storylineId", "items": "items", "groups": "groups", "viewport": "viewport"},
            readers={"items": _board_nodes_from_json, "groups": _board_groups_from_json, "viewport": _viewport_from_json},
            writers={"items": _board_nodes_to_json, "groups": _board_groups_to_json, "viewport": _viewport_to_json},
        ),
    )
    registry.register(
        EntityType.GRAPH_LAYOUTS,
        DataclassRecordMapper(
            GraphLayout,
            {"name": "name", "nodes": "nodes", "viewport": "viewport", "mode": "mode", "filters": "filters", "mode_styles": "modeStyles"},
            readers={"nodes": _graph_nodes_from_json, "viewport": _viewport_from_json},
            writers={"nodes": _graph_nodes_to_json, "viewport": _viewport_to_json},
        ),
    )
    return registry
