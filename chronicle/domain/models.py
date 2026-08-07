from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any, ClassVar


JsonObject = dict[str, Any]


class EntityType(StrEnum):
    CAMPAIGNS = "campaigns"
    COTERIES = "coteries"
    CHARACTERS = "characters"
    FACTIONS = "factions"
    LOCATIONS = "locations"
    EVENTS = "events"
    FACTS = "facts"
    CLUES = "clues"
    ARTIFACTS = "artifacts"
    STORYLINES = "storylines"
    THEORIES = "theories"
    NOTES = "notes"
    MEMOIRS = "memoirs"
    INVESTIGATION_BOARDS = "investigationBoards"
    GRAPH_LAYOUTS = "graphLayouts"
    TAG_DEFINITIONS = "tagDefinitions"
    ENTITY_TEMPLATES = "entityTemplates"
    SAVED_SEARCHES = "savedSearches"
    BOOKMARKS = "bookmarks"
    MENTION_DISMISSALS = "mentionDismissals"


SUPPORT_ENTITY_TYPES = (
    EntityType.TAG_DEFINITIONS,
    EntityType.ENTITY_TEMPLATES,
    EntityType.SAVED_SEARCHES,
    EntityType.BOOKMARKS,
    EntityType.MENTION_DISMISSALS,
)

PUBLIC_ENTITY_TYPES = tuple(item for item in EntityType if item is not EntityType.GRAPH_LAYOUTS)

TAGGABLE_ENTITY_TYPES = (
    EntityType.COTERIES,
    EntityType.CHARACTERS,
    EntityType.FACTIONS,
    EntityType.LOCATIONS,
    EntityType.EVENTS,
    EntityType.FACTS,
    EntityType.CLUES,
    EntityType.ARTIFACTS,
    EntityType.STORYLINES,
    EntityType.THEORIES,
    EntityType.NOTES,
    EntityType.MEMOIRS,
)


@dataclass(frozen=True, slots=True)
class EntityRef:
    entity_type: EntityType
    entity_id: str

    @property
    def key(self) -> str:
        return f"{self.entity_type.value}:{self.entity_id}"

    @classmethod
    def from_key(cls, value: str) -> EntityRef:
        entity_type, entity_id = value.split(":", 1)
        return cls(EntityType(entity_type), entity_id)


@dataclass(slots=True)
class SystemTag:
    namespace: str
    value: str
    label: str = ""
    color: str = ""


@dataclass(slots=True, kw_only=True)
class ChronicleEntity:
    id: str
    created_at: str
    updated_at: str
    extra: JsonObject = field(default_factory=dict, repr=False)

    entity_type: ClassVar[EntityType]

    @property
    def ref(self) -> EntityRef:
        return EntityRef(self.entity_type, self.id)


@dataclass(slots=True, kw_only=True)
class Campaign(ChronicleEntity):
    entity_type: ClassVar[EntityType] = EntityType.CAMPAIGNS
    title: str = ""
    description: str = ""
    setting: str = ""


@dataclass(slots=True, kw_only=True)
class Coterie(ChronicleEntity):
    entity_type: ClassVar[EntityType] = EntityType.COTERIES
    name: str = ""
    description: str = ""
    goals: str = ""
    haven: str = ""
    importance: str = ""
    notes: str = ""
    tags: list[str] = field(default_factory=list)
    aliases: list[str] = field(default_factory=list)


@dataclass(slots=True, kw_only=True)
class Character(ChronicleEntity):
    entity_type: ClassVar[EntityType] = EntityType.CHARACTERS
    name: str = ""
    character_type: str = ""
    species: str = "Не известно"
    vampire_clan: str = ""
    garou_tribe: str = ""
    status: str = ""
    importance: str = ""
    known_abilities: list[str] = field(default_factory=list)
    description: str = ""
    notes: str = ""
    tags: list[str] = field(default_factory=list)
    aliases: list[str] = field(default_factory=list)
    system_tags: list[SystemTag] = field(default_factory=list)


@dataclass(slots=True, kw_only=True)
class Faction(ChronicleEntity):
    entity_type: ClassVar[EntityType] = EntityType.FACTIONS
    name: str = ""
    faction_type: str = ""
    sect: str = ""
    importance: str = ""
    description: str = ""
    goals: str = ""
    is_secondary: bool = False
    main_faction_id: str = ""
    notes: str = ""
    tags: list[str] = field(default_factory=list)
    aliases: list[str] = field(default_factory=list)
    system_tags: list[SystemTag] = field(default_factory=list)


@dataclass(slots=True, kw_only=True)
class Location(ChronicleEntity):
    entity_type: ClassVar[EntityType] = EntityType.LOCATIONS
    name: str = ""
    level: str = ""
    parent_city_id: str = ""
    sect: str = ""
    faction_id: str = ""
    importance: str = ""
    description: str = ""
    notes: str = ""
    tags: list[str] = field(default_factory=list)
    aliases: list[str] = field(default_factory=list)


@dataclass(slots=True, kw_only=True)
class ChronicleEvent(ChronicleEntity):
    entity_type: ClassVar[EntityType] = EntityType.EVENTS
    title: str = ""
    description: str = ""
    game_date: str = ""
    game_time: str = ""
    importance: str = ""
    content_type: str = ""
    city_id: str = ""
    place_id: str = ""
    consequence: str = ""
    notes: str = ""
    tags: list[str] = field(default_factory=list)
    aliases: list[str] = field(default_factory=list)


@dataclass(slots=True, kw_only=True)
class Fact(ChronicleEntity):
    entity_type: ClassVar[EntityType] = EntityType.FACTS
    statement: str = ""
    source: str = ""
    reliability: str = ""
    importance: str = ""
    content_type: str = ""
    event_id: str = ""
    attached_relationship_ids: list[str] = field(default_factory=list)
    notes: str = ""
    tags: list[str] = field(default_factory=list)
    aliases: list[str] = field(default_factory=list)


@dataclass(slots=True, kw_only=True)
class Clue(ChronicleEntity):
    entity_type: ClassVar[EntityType] = EntityType.CLUES
    title: str = ""
    description: str = ""
    clue_type: str = ""
    source: str = ""
    reliability: str = ""
    importance: str = ""
    event_id: str = ""
    discovered_by_ids: list[str] = field(default_factory=list)
    attached_relationship_ids: list[str] = field(default_factory=list)
    notes: str = ""
    tags: list[str] = field(default_factory=list)
    aliases: list[str] = field(default_factory=list)


@dataclass(slots=True, kw_only=True)
class Artifact(ChronicleEntity):
    entity_type: ClassVar[EntityType] = EntityType.ARTIFACTS
    title: str = ""
    owner_id: str = ""
    importance: str = ""
    description: str = ""
    notes: str = ""
    tags: list[str] = field(default_factory=list)
    aliases: list[str] = field(default_factory=list)


@dataclass(slots=True, kw_only=True)
class Storyline(ChronicleEntity):
    entity_type: ClassVar[EntityType] = EntityType.STORYLINES
    title: str = ""
    description: str = ""
    status: str = ""
    importance: str = ""
    open_questions: str = ""
    notes: str = ""
    tags: list[str] = field(default_factory=list)
    aliases: list[str] = field(default_factory=list)


@dataclass(slots=True, kw_only=True)
class Theory(ChronicleEntity):
    entity_type: ClassVar[EntityType] = EntityType.THEORIES
    title: str = ""
    author_id: str = ""
    status: str = ""
    importance: str = ""
    description: str = ""
    attached_relationship_ids: list[str] = field(default_factory=list)
    notes: str = ""
    tags: list[str] = field(default_factory=list)
    aliases: list[str] = field(default_factory=list)


@dataclass(slots=True, kw_only=True)
class BoardNote(ChronicleEntity):
    entity_type: ClassVar[EntityType] = EntityType.NOTES
    title: str = ""
    author_id: str = ""
    importance: str = ""
    text: str = ""
    attached_relationship_ids: list[str] = field(default_factory=list)
    notes: str = ""
    tags: list[str] = field(default_factory=list)
    aliases: list[str] = field(default_factory=list)


@dataclass(slots=True, kw_only=True)
class Memoir(ChronicleEntity):
    entity_type: ClassVar[EntityType] = EntityType.MEMOIRS
    author_id: str = ""
    entry_date: str = ""
    text: str = ""
    mood: str = ""
    plans: str = ""
    suspicions: str = ""
    event_ids: list[str] = field(default_factory=list)
    character_ids: list[str] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)


@dataclass(slots=True)
class Viewport:
    x: float = 0
    y: float = 0
    zoom: float = 1


@dataclass(slots=True)
class NodeStyle:
    color: str = ""
    text_color: str = ""
    border_color: str = ""
    border_style: str = ""
    border_width: float = 0


@dataclass(slots=True)
class BoardNode:
    entity: EntityRef
    x: float = 0
    y: float = 0
    width: float = 280
    height: float = 170
    style: NodeStyle = field(default_factory=NodeStyle)


@dataclass(slots=True)
class BoardGroup:
    id: str
    name: str = "Группа"
    x: float = 0
    y: float = 0
    width: float = 640
    height: float = 420
    color: str = ""
    border_color: str = ""
    border_style: str = "dashed"


@dataclass(slots=True, kw_only=True)
class InvestigationBoard(ChronicleEntity):
    entity_type: ClassVar[EntityType] = EntityType.INVESTIGATION_BOARDS
    name: str = ""
    description: str = ""
    status: str = "Активна"
    storyline_id: str = ""
    items: list[BoardNode] = field(default_factory=list)
    groups: list[BoardGroup] = field(default_factory=list)
    viewport: Viewport = field(default_factory=Viewport)


@dataclass(slots=True)
class GraphNodePlacement:
    entity: EntityRef
    x: float = 0
    y: float = 0
    scale: float = 1
    pinned: bool = False
    style: NodeStyle = field(default_factory=NodeStyle)


@dataclass(slots=True, kw_only=True)
class GraphLayout(ChronicleEntity):
    entity_type: ClassVar[EntityType] = EntityType.GRAPH_LAYOUTS
    name: str = "Основной граф"
    nodes: list[GraphNodePlacement] = field(default_factory=list)
    viewport: Viewport = field(default_factory=Viewport)
    mode: str = "custom"
    filters: JsonObject = field(default_factory=dict)
    mode_styles: JsonObject = field(default_factory=dict)
    mode_layouts: JsonObject = field(default_factory=dict)


@dataclass(slots=True, kw_only=True)
class TagDefinition(ChronicleEntity):
    entity_type: ClassVar[EntityType] = EntityType.TAG_DEFINITIONS
    name: str = ""
    description: str = ""
    recommended: bool = False


@dataclass(slots=True, kw_only=True)
class EntityTemplate(ChronicleEntity):
    entity_type: ClassVar[EntityType] = EntityType.ENTITY_TEMPLATES
    name: str = ""
    target_type: str = ""
    payload: JsonObject = field(default_factory=dict)


@dataclass(slots=True, kw_only=True)
class SavedSearch(ChronicleEntity):
    entity_type: ClassVar[EntityType] = EntityType.SAVED_SEARCHES
    name: str = ""
    query: str = ""
    sort_by: str = "updatedAt"
    sort_direction: str = "desc"


@dataclass(slots=True, kw_only=True)
class Bookmark(ChronicleEntity):
    entity_type: ClassVar[EntityType] = EntityType.BOOKMARKS
    title: str = ""
    kind: str = "entity"
    target: JsonObject = field(default_factory=dict)
    group: str = ""
    order: int = 0


@dataclass(slots=True, kw_only=True)
class MentionDismissal(ChronicleEntity):
    entity_type: ClassVar[EntityType] = EntityType.MENTION_DISMISSALS
    pair_key: str = ""
    source_type: str = ""
    source_id: str = ""
    target_type: str = ""
    target_id: str = ""


@dataclass(slots=True)
class Relationship:
    id: str
    source: EntityRef
    target: EntityRef
    relation_label: str = "связано"
    notes: str = ""
    edge_color: str = ""
    arrow_direction: str = ""
    line_style: str = "solid"
    created_at: str = ""
    updated_at: str = ""

    @property
    def pair_key(self) -> tuple[str, str]:
        return tuple(sorted((self.source.key, self.target.key)))


@dataclass(slots=True)
class RecordEnvelope:
    entity_type: EntityType
    id: str
    payload: JsonObject
    created_at: str
    updated_at: str
