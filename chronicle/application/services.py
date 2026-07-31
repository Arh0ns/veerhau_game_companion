from __future__ import annotations

import datetime as dt
import hashlib
import re
import secrets
from dataclasses import dataclass
from typing import Any, Callable

from chronicle.domain.models import (
    ChronicleEntity,
    Character,
    EntityRef,
    EntityType,
    InvestigationBoard,
    Faction,
    PUBLIC_ENTITY_TYPES,
    RecordEnvelope,
    Relationship,
    TAGGABLE_ENTITY_TYPES,
    TagDefinition,
)
from chronicle.domain.policies import CoterieDispositionPolicy, RelationshipLabelPolicy
from chronicle.infrastructure.mappers import RecordMapperRegistry
from chronicle.ports.repositories import UnitOfWork


UnitOfWorkFactory = Callable[[], UnitOfWork]

ID_PREFIXES: dict[EntityType, str] = {
    EntityType.CAMPAIGNS: "cmp",
    EntityType.COTERIES: "cot",
    EntityType.CHARACTERS: "chr",
    EntityType.FACTIONS: "fac",
    EntityType.LOCATIONS: "loc",
    EntityType.EVENTS: "evt",
    EntityType.FACTS: "fact",
    EntityType.CLUES: "clue",
    EntityType.STORYLINES: "story",
    EntityType.THEORIES: "theory",
    EntityType.NOTES: "note",
    EntityType.MEMOIRS: "memoir",
    EntityType.INVESTIGATION_BOARDS: "board",
    EntityType.GRAPH_LAYOUTS: "graph",
    EntityType.TAG_DEFINITIONS: "tag",
    EntityType.ENTITY_TEMPLATES: "tpl",
    EntityType.SAVED_SEARCHES: "search",
    EntityType.BOOKMARKS: "bookmark",
    EntityType.MENTION_DISMISSALS: "mention-dismissal",
}


class NotFoundError(RuntimeError):
    pass


class ValidationError(RuntimeError):
    pass


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def serialize_entity(entity: ChronicleEntity, mappers: RecordMapperRegistry) -> dict[str, Any]:
    envelope = mappers.to_record(entity)
    return {
        **envelope.payload,
        "id": envelope.id,
        "createdAt": envelope.created_at,
        "updatedAt": envelope.updated_at,
    }


def serialize_relationship(relationship: Relationship) -> dict[str, Any]:
    return {
        "id": relationship.id,
        "sourceType": relationship.source.entity_type.value,
        "sourceId": relationship.source.entity_id,
        "targetType": relationship.target.entity_type.value,
        "targetId": relationship.target.entity_id,
        "relationLabel": relationship.relation_label,
        "notes": relationship.notes,
        "edgeColor": relationship.edge_color,
        "arrowDirection": relationship.arrow_direction,
        "lineStyle": relationship.line_style,
        "createdAt": relationship.created_at,
        "updatedAt": relationship.updated_at,
    }


def clean_payload(payload: dict[str, Any]) -> dict[str, Any]:
    blocked = {"id", "createdAt", "updatedAt", "created_at", "updated_at"}
    return {key: value for key, value in payload.items() if key not in blocked}


def normalize_tag(value: Any) -> str:
    tag = str(value or "").strip().lstrip("#").casefold()
    if not tag:
        return ""
    if re.search(r"\s|#", tag) or "//" in tag or tag.startswith("/") or tag.endswith("/"):
        raise ValidationError("Тег не должен содержать пробелы, # или пустые уровни.")
    if tag.isdecimal():
        raise ValidationError("Тег должен содержать хотя бы один нечисловой символ.")
    return tag


def normalize_string_list(value: Any, *, tags: bool = False) -> list[str]:
    if isinstance(value, str):
        items = value.split(",")
    elif isinstance(value, list):
        items = value
    else:
        items = []
    result: list[str] = []
    seen: set[str] = set()
    for item in items:
        normalized = normalize_tag(item) if tags else str(item or "").strip()
        key = normalized.casefold()
        if not normalized or key in seen:
            continue
        seen.add(key)
        result.append(normalized)
    return result


STRUCTURED_TAG_FIELDS: dict[EntityType, tuple[str, ...]] = {
    EntityType.CHARACTERS: ("characterType", "species", "vampireClan", "garouTribe", "status"),
    EntityType.LOCATIONS: ("level", "parentCityId", "sect", "factionId"),
    EntityType.EVENTS: ("cityId", "placeId"),
    EntityType.FACTS: ("reliability", "eventId"),
    EntityType.CLUES: ("reliability", "eventId", "discoveredByIds"),
    EntityType.STORYLINES: ("status",),
    EntityType.THEORIES: ("authorId", "status"),
    EntityType.NOTES: ("authorId",),
    EntityType.MEMOIRS: ("authorId", "eventIds", "characterIds"),
}


def sync_structured_system_tags(entity_type: EntityType, payload: dict[str, Any]) -> None:
    fields = STRUCTURED_TAG_FIELDS.get(entity_type, ())
    if not fields:
        return
    existing = [item for item in payload.get("systemTags", []) if isinstance(item, dict)]
    existing_by_key = {
        (str(item.get("namespace", "")), str(item.get("value", ""))): item
        for item in existing
    }
    controlled = {f"field:{key}" for key in fields}
    result = [item for item in existing if item.get("namespace") not in controlled]
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
            previous = existing_by_key.get((namespace, normalized), {})
            result.append(
                {
                    "namespace": namespace,
                    "value": normalized,
                    "label": str(previous.get("label") or normalized),
                    "color": str(previous.get("color") or ""),
                }
            )
    payload["systemTags"] = result


class RecordService:
    def __init__(
        self,
        uow_factory: UnitOfWorkFactory,
        mappers: RecordMapperRegistry,
        disposition_policy: CoterieDispositionPolicy | None = None,
    ) -> None:
        self.uow_factory = uow_factory
        self.mappers = mappers
        self.disposition_policy = disposition_policy or CoterieDispositionPolicy()

    def list(self, entity_type: EntityType) -> list[dict[str, Any]]:
        with self.uow_factory() as uow:
            return [
                serialize_entity(entity, self.mappers)
                for entity in uow.records.find_all(entity_type)
            ]

    def get(self, ref: EntityRef) -> dict[str, Any]:
        with self.uow_factory() as uow:
            entity = uow.records.find(ref)
            if not entity:
                raise NotFoundError("Объект не найден.")
            return serialize_entity(entity, self.mappers)

    def create(self, entity_type: EntityType, payload: dict[str, Any]) -> dict[str, Any]:
        now = utc_now()
        entity_id = f"{ID_PREFIXES[entity_type]}_{secrets.token_hex(8)}"
        envelope = RecordEnvelope(
            entity_type=entity_type,
            id=entity_id,
            payload=self._prepare_payload(entity_type, clean_payload(payload)),
            created_at=now,
            updated_at=now,
        )
        entity = self.mappers.from_record(envelope)
        self._apply_policies(entity)
        self._validate(entity)
        with self.uow_factory() as uow:
            uow.records.save(entity)
        return serialize_entity(entity, self.mappers)

    def update(self, ref: EntityRef, patch: dict[str, Any]) -> dict[str, Any]:
        with self.uow_factory() as uow:
            current = uow.records.find(ref)
            if not current:
                raise NotFoundError("Объект не найден.")
            current_envelope = self.mappers.to_record(current)
            merged = self._prepare_payload(
                ref.entity_type,
                {**current_envelope.payload, **clean_payload(patch)},
            )
            updated = self.mappers.from_record(
                RecordEnvelope(
                    entity_type=ref.entity_type,
                    id=ref.entity_id,
                    payload=merged,
                    created_at=current.created_at,
                    updated_at=utc_now(),
                )
            )
            self._apply_policies(updated)
            self._validate(updated)
            uow.records.save(updated)
        return serialize_entity(updated, self.mappers)

    def delete(self, ref: EntityRef) -> None:
        if ref.entity_type is EntityType.CAMPAIGNS:
            raise ValidationError("Кампанию нельзя удалить в MVP.")
        with self.uow_factory() as uow:
            if not uow.records.find(ref):
                raise NotFoundError("Объект не найден.")
            uow.relationships.delete_for_entity(ref)
            uow.records.delete(ref)

    @staticmethod
    def _validate(entity: ChronicleEntity) -> None:
        if isinstance(entity, InvestigationBoard):
            keys = [item.entity.key for item in entity.items]
            if len(keys) != len(set(keys)):
                raise ValidationError("Один объект нельзя добавить на доску дважды.")
            if not 0.2 <= entity.viewport.zoom <= 4:
                raise ValidationError("Масштаб доски вне допустимого диапазона.")

    @staticmethod
    def _prepare_payload(entity_type: EntityType, payload: dict[str, Any]) -> dict[str, Any]:
        prepared = dict(payload)
        if entity_type in TAGGABLE_ENTITY_TYPES:
            prepared["tags"] = normalize_string_list(prepared.get("tags"), tags=True)
            if entity_type is not EntityType.MEMOIRS:
                prepared["aliases"] = normalize_string_list(prepared.get("aliases"))
            sync_structured_system_tags(entity_type, prepared)
        return prepared

    def _apply_policies(self, entity: ChronicleEntity) -> None:
        if isinstance(entity, (Character, Faction)):
            self.disposition_policy.normalize(entity)


class TagService:
    def __init__(
        self,
        uow_factory: UnitOfWorkFactory,
        mappers: RecordMapperRegistry,
        records: RecordService,
    ) -> None:
        self.uow_factory = uow_factory
        self.mappers = mappers
        self.records = records

    def list(self) -> list[dict[str, Any]]:
        counts: dict[str, int] = {}
        with self.uow_factory() as uow:
            for entity_type in TAGGABLE_ENTITY_TYPES:
                for entity in uow.records.find_all(entity_type):
                    for tag in getattr(entity, "tags", []):
                        counts[tag] = counts.get(tag, 0) + 1
            definitions = uow.records.find_all(EntityType.TAG_DEFINITIONS)
        by_name = {
            item.name: item
            for item in definitions
            if isinstance(item, TagDefinition) and item.name
        }
        names = sorted(set(counts) | set(by_name))
        return [
            {
                "id": by_name[name].id if name in by_name else "",
                "name": name,
                "count": counts.get(name, 0),
                "description": by_name[name].description if name in by_name else "",
                "recommended": by_name[name].recommended if name in by_name else False,
            }
            for name in names
        ]

    def add(self, payload: dict[str, Any]) -> dict[str, Any]:
        name = normalize_tag(payload.get("name"))
        if not name:
            raise ValidationError("Введите название тега.")
        existing = next((item for item in self.list() if item["name"] == name), None)
        definition_payload = {
            "name": name,
            "description": str(payload.get("description", "") or "").strip(),
            "recommended": bool(payload.get("recommended", True)),
        }
        if existing and existing["id"]:
            return self.records.update(
                EntityRef(EntityType.TAG_DEFINITIONS, existing["id"]),
                definition_payload,
            )
        return self.records.create(EntityType.TAG_DEFINITIONS, definition_payload)

    def rename(self, source: Any, target: Any, *, merge: bool) -> dict[str, Any]:
        source_name = normalize_tag(source)
        target_name = normalize_tag(target)
        if not source_name or not target_name:
            raise ValidationError("Укажите исходный и новый тег.")
        if source_name == target_name:
            return {"updatedRecords": 0, "tags": self.list()}
        if target_name.startswith(f"{source_name}/"):
            raise ValidationError("Нельзя переместить тег внутрь его собственного поддерева.")
        current = self.list()
        existing_names = {item["name"] for item in current}
        affected_names = {
            name
            for name in existing_names
            if name == source_name or name.startswith(f"{source_name}/")
        }
        if not affected_names:
            raise NotFoundError("Исходный тег не найден.")

        def renamed(name: str) -> str:
            return f"{target_name}{name[len(source_name):]}"

        unaffected_names = existing_names - affected_names
        conflicts = {renamed(name) for name in affected_names} & unaffected_names
        if not merge and conflicts:
            raise ValidationError("Новый тег или один из его дочерних тегов уже существует. Используйте объединение.")
        updated = 0
        now = utc_now()
        with self.uow_factory() as uow:
            for entity_type in TAGGABLE_ENTITY_TYPES:
                for entity in uow.records.find_all(entity_type):
                    tags = list(getattr(entity, "tags", []))
                    if not any(tag in affected_names for tag in tags):
                        continue
                    replaced = [renamed(tag) if tag in affected_names else tag for tag in tags]
                    entity.tags = normalize_string_list(replaced, tags=True)
                    entity.updated_at = now
                    uow.records.save(entity)
                    updated += 1
            definitions = [
                item for item in uow.records.find_all(EntityType.TAG_DEFINITIONS)
                if isinstance(item, TagDefinition)
            ]
            grouped: dict[str, list[TagDefinition]] = {}
            for definition in definitions:
                final_name = renamed(definition.name) if definition.name in affected_names else definition.name
                grouped.setdefault(final_name, []).append(definition)
            for final_name, group in grouped.items():
                if not any(item.name in affected_names for item in group):
                    continue
                keeper = next((item for item in group if item.name == final_name), group[0])
                for item in group:
                    if item is keeper:
                        continue
                    keeper.recommended = keeper.recommended or item.recommended
                    keeper.description = keeper.description or item.description
                    uow.records.delete(item.ref)
                keeper.name = final_name
                keeper.updated_at = now
                uow.records.save(keeper)
        return {"updatedRecords": updated, "tags": self.list()}


class BoardService:
    def __init__(self, records: RecordService) -> None:
        self.records = records

    def list(self) -> list[dict[str, Any]]:
        return self.records.list(EntityType.INVESTIGATION_BOARDS)

    def get(self, board_id: str) -> dict[str, Any]:
        return self.records.get(EntityRef(EntityType.INVESTIGATION_BOARDS, board_id))

    def create(self, payload: dict[str, Any]) -> dict[str, Any]:
        payload = {
            "status": "Активна",
            "storylineId": "",
            "items": [],
            "groups": [],
            "viewport": {"x": 0, "y": 0, "zoom": 1},
            **payload,
        }
        return self.records.create(EntityType.INVESTIGATION_BOARDS, payload)

    def update(self, board_id: str, patch: dict[str, Any]) -> dict[str, Any]:
        return self.records.update(
            EntityRef(EntityType.INVESTIGATION_BOARDS, board_id), patch
        )

    def delete(self, board_id: str) -> None:
        self.records.delete(EntityRef(EntityType.INVESTIGATION_BOARDS, board_id))


class RelationshipService:
    def __init__(
        self,
        uow_factory: UnitOfWorkFactory,
        label_policy: RelationshipLabelPolicy,
    ) -> None:
        self.uow_factory = uow_factory
        self.label_policy = label_policy

    @staticmethod
    def _arrow(value: Any) -> str:
        value = str(value or "")
        return value if value in {"source-to-target", "target-to-source"} else ""

    @staticmethod
    def _line_style(value: Any) -> str:
        value = str(value or "solid")
        return value if value in {"solid", "dashed"} else "solid"

    def list(self) -> list[dict[str, Any]]:
        with self.uow_factory() as uow:
            return [serialize_relationship(item) for item in uow.relationships.find_all()]

    def get(self, relationship_id: str) -> dict[str, Any]:
        with self.uow_factory() as uow:
            relationship = uow.relationships.find(relationship_id)
            if not relationship:
                raise NotFoundError("Связь не найдена.")
            return serialize_relationship(relationship)

    def upsert(self, payload: dict[str, Any]) -> tuple[dict[str, Any], bool]:
        source = self._ref(payload, "source")
        target = self._ref(payload, "target")
        if source == target:
            raise ValidationError("Нельзя связать объект с самим собой.")
        label = str(payload.get("relationLabel", "") or "связано")
        try:
            self.label_policy.validate(source.entity_type, target.entity_type, label)
        except ValueError as exc:
            raise ValidationError(str(exc)) from exc
        with self.uow_factory() as uow:
            self._ensure_endpoints(uow, source, target)
            existing = uow.relationships.find_by_pair(source, target)
            created = existing is None
            now = utc_now()
            relationship = Relationship(
                id=existing.id if existing else f"rel_{secrets.token_hex(8)}",
                source=source,
                target=target,
                relation_label=label,
                notes=str(payload.get("notes", existing.notes if existing else "")),
                edge_color=str(payload.get("edgeColor") or (existing.edge_color if existing else "") or self.label_policy.default_color(label)),
                arrow_direction=self._arrow(payload.get("arrowDirection", existing.arrow_direction if existing else "")),
                line_style=self._line_style(payload.get("lineStyle", existing.line_style if existing else "solid")),
                created_at=existing.created_at if existing else now,
                updated_at=now,
            )
            uow.relationships.save(relationship)
        return serialize_relationship(relationship), created

    def update(self, relationship_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        with self.uow_factory() as uow:
            current = uow.relationships.find(relationship_id)
            if not current:
                raise NotFoundError("Связь не найдена.")
            source = self._ref(payload, "source", current.source)
            target = self._ref(payload, "target", current.target)
            label = str(payload.get("relationLabel", current.relation_label) or "связано")
            try:
                self.label_policy.validate(source.entity_type, target.entity_type, label)
            except ValueError as exc:
                raise ValidationError(str(exc)) from exc
            self._ensure_endpoints(uow, source, target)
            duplicate = uow.relationships.find_by_pair(
                source, target, exclude_id=relationship_id
            )
            requested_edge_color = payload.get("edgeColor")
            edge_color = str(requested_edge_color or current.edge_color)
            if not edge_color or (
                requested_edge_color is None
                and
                label != current.relation_label
                and edge_color == self.label_policy.DEFAULT_COLOR
            ):
                edge_color = self.label_policy.default_color(label)
            relationship = Relationship(
                id=duplicate.id if duplicate else relationship_id,
                source=source,
                target=target,
                relation_label=label,
                notes=str(payload.get("notes", current.notes)),
                edge_color=edge_color,
                arrow_direction=self._arrow(payload.get("arrowDirection", current.arrow_direction)),
                line_style=self._line_style(payload.get("lineStyle", current.line_style)),
                created_at=duplicate.created_at if duplicate else current.created_at,
                updated_at=utc_now(),
            )
            uow.relationships.save(relationship)
            if duplicate:
                uow.relationships.delete(relationship_id)
        return serialize_relationship(relationship)

    def delete(self, relationship_id: str) -> None:
        with self.uow_factory() as uow:
            if not uow.relationships.delete(relationship_id):
                raise NotFoundError("Связь не найдена.")

    @staticmethod
    def _ensure_endpoints(uow: UnitOfWork, source: EntityRef, target: EntityRef) -> None:
        if not uow.records.find(source) or not uow.records.find(target):
            raise ValidationError("Один из связанных объектов не существует.")

    @staticmethod
    def _ref(
        payload: dict[str, Any],
        prefix: str,
        fallback: EntityRef | None = None,
    ) -> EntityRef:
        type_value = payload.get(f"{prefix}Type")
        id_value = payload.get(f"{prefix}Id")
        if type_value is None and fallback:
            return fallback
        try:
            return EntityRef(EntityType(str(type_value)), str(id_value or ""))
        except ValueError as exc:
            raise ValidationError("Некорректный тип связи.") from exc


class ChronicleQueryService:
    def __init__(
        self,
        records: RecordService,
        relationships: RelationshipService,
    ) -> None:
        self.records = records
        self.relationships = relationships

    def bootstrap(self) -> dict[str, Any]:
        result = {
            entity_type.value: self.records.list(entity_type)
            for entity_type in (*PUBLIC_ENTITY_TYPES, EntityType.GRAPH_LAYOUTS)
        }
        result["relationships"] = self.relationships.list()
        return result


@dataclass(frozen=True, slots=True)
class SessionToken:
    value: str
    expires_at: str


class SessionService:
    def __init__(
        self,
        uow_factory: UnitOfWorkFactory,
        password: str,
        session_days: int,
    ) -> None:
        self.uow_factory = uow_factory
        self.password = password
        self.session_days = session_days

    @staticmethod
    def hash_token(token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    def login(self, password: str) -> SessionToken:
        if not secrets.compare_digest(password, self.password):
            raise ValidationError("Неверный пароль.")
        token = secrets.token_urlsafe(32)
        created_at = utc_now()
        expires_at = (
            dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=self.session_days)
        ).replace(microsecond=0).isoformat()
        with self.uow_factory() as uow:
            uow.sessions.save(self.hash_token(token), created_at, expires_at)
        return SessionToken(token, expires_at)

    def authenticated(self, token: str | None) -> bool:
        if not token:
            return False
        now = utc_now()
        with self.uow_factory() as uow:
            uow.sessions.delete_expired(now)
            row = uow.sessions.find(self.hash_token(token))
            return bool(row and row[1] >= now)

    def logout(self, token: str | None) -> None:
        if not token:
            return
        with self.uow_factory() as uow:
            uow.sessions.delete(self.hash_token(token))
