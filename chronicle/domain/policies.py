from __future__ import annotations

from .models import Character, EntityType, Faction, SystemTag


class CoterieDispositionPolicy:
    NAMESPACE = "coterie-disposition"
    PLAYER_CHARACTER = "Игровой персонаж"
    COLORS = {
        "ally": "#2f8f5b",
        "enemy": "#b23a48",
        "neutral": "#737982",
        "unknown": "#f4f4f2",
    }
    LABELS = {
        "ally": "Союзник",
        "enemy": "Враг",
        "neutral": "Нейтралитет",
        "unknown": "Неизвестно",
    }

    def normalize(self, entity: Character | Faction) -> None:
        if isinstance(entity, Character) and entity.character_type == self.PLAYER_CHARACTER:
            entity.system_tags = [tag for tag in entity.system_tags if tag.namespace != self.NAMESPACE]
            return
        current = next((tag for tag in entity.system_tags if tag.namespace == self.NAMESPACE), None)
        if current is None:
            current = SystemTag(self.NAMESPACE, "unknown")
        value = current.value if current.value in {*self.COLORS, "custom"} else "unknown"
        label = current.label.strip() if value == "custom" else self.LABELS[value]
        if value == "custom" and not label:
            value = "unknown"
            label = self.LABELS[value]
        color = current.color if value == "custom" and current.color else self.COLORS.get(value, "#737982")
        normalized = SystemTag(self.NAMESPACE, value, label, color)
        entity.system_tags = [tag for tag in entity.system_tags if tag.namespace != self.NAMESPACE]
        entity.system_tags.append(normalized)


class EntityChoicePolicy:
    BOARD_PRIMARY = (
        EntityType.EVENTS,
        EntityType.FACTS,
        EntityType.CLUES,
        EntityType.ARTIFACTS,
        EntityType.THEORIES,
        EntityType.NOTES,
    )
    BOARD_MORE = (
        EntityType.CHARACTERS,
        EntityType.FACTIONS,
        EntityType.LOCATIONS,
        EntityType.STORYLINES,
    )
    LINKABLE = tuple(
        item
        for item in EntityType
        if item
        not in {
            EntityType.INVESTIGATION_BOARDS,
            EntityType.GRAPH_LAYOUTS,
            EntityType.TAG_DEFINITIONS,
            EntityType.ENTITY_TEMPLATES,
            EntityType.SAVED_SEARCHES,
            EntityType.BOOKMARKS,
            EntityType.MENTION_DISMISSALS,
        }
    )

    _RECOMMENDED: dict[EntityType, tuple[EntityType, ...]] = {
        EntityType.CHARACTERS: (
            EntityType.CHARACTERS,
            EntityType.FACTIONS,
            EntityType.COTERIES,
            EntityType.EVENTS,
            EntityType.CLUES,
            EntityType.ARTIFACTS,
        ),
        EntityType.FACTIONS: (
            EntityType.CHARACTERS,
            EntityType.FACTIONS,
            EntityType.COTERIES,
            EntityType.LOCATIONS,
            EntityType.STORYLINES,
        ),
        EntityType.EVENTS: (
            EntityType.CHARACTERS,
            EntityType.LOCATIONS,
            EntityType.FACTS,
            EntityType.CLUES,
            EntityType.ARTIFACTS,
            EntityType.STORYLINES,
        ),
        EntityType.FACTS: (
            EntityType.EVENTS,
            EntityType.CLUES,
            EntityType.ARTIFACTS,
            EntityType.THEORIES,
            EntityType.CHARACTERS,
            EntityType.STORYLINES,
        ),
        EntityType.CLUES: (
            EntityType.EVENTS,
            EntityType.FACTS,
            EntityType.ARTIFACTS,
            EntityType.THEORIES,
            EntityType.CHARACTERS,
            EntityType.STORYLINES,
        ),
        EntityType.ARTIFACTS: (
            EntityType.CHARACTERS,
            EntityType.EVENTS,
            EntityType.FACTS,
            EntityType.CLUES,
            EntityType.THEORIES,
        ),
        EntityType.THEORIES: (
            EntityType.FACTS,
            EntityType.CLUES,
            EntityType.ARTIFACTS,
            EntityType.EVENTS,
            EntityType.CHARACTERS,
            EntityType.STORYLINES,
        ),
        EntityType.STORYLINES: (
            EntityType.EVENTS,
            EntityType.FACTS,
            EntityType.CLUES,
            EntityType.ARTIFACTS,
            EntityType.THEORIES,
            EntityType.FACTIONS,
        ),
        EntityType.LOCATIONS: (
            EntityType.EVENTS,
            EntityType.CHARACTERS,
            EntityType.FACTIONS,
            EntityType.LOCATIONS,
            EntityType.STORYLINES,
        ),
    }

    def relationship_targets(self, source: EntityType) -> tuple[EntityType, ...]:
        recommended = self._RECOMMENDED.get(source, ())
        return recommended or self.LINKABLE[:5]

    def remaining_targets(self, source: EntityType) -> tuple[EntityType, ...]:
        recommended = set(self.relationship_targets(source))
        return tuple(item for item in self.LINKABLE if item not in recommended)


class RelationshipLabelPolicy:
    FACTION_CHILD = "Дочерняя фракция"
    DEFAULT_COLOR = "#737982"
    COLORS = {"враг": "#b23a48", "enemy": "#b23a48", "союзник": "#2f8f5b", "ally": "#2f8f5b"}

    def default_color(self, label: str) -> str:
        return self.COLORS.get(label.strip().casefold(), self.DEFAULT_COLOR)

    def presets(self, source: EntityType, target: EntityType) -> tuple[str, ...]:
        pair = {source, target}
        if source is EntityType.FACTIONS and target is EntityType.FACTIONS:
            return ("связано", "союзник", "враг", self.FACTION_CHILD)
        if pair <= {EntityType.CHARACTERS, EntityType.FACTIONS, EntityType.COTERIES}:
            return ("связано", "член", "союзник", "враг")
        if pair == {EntityType.EVENTS, EntityType.LOCATIONS}:
            return ("связано", "произошло в")
        if source is EntityType.CHARACTERS and target is EntityType.ARTIFACTS:
            return ("владеет", "связано")
        if source is EntityType.ARTIFACTS and target is EntityType.CHARACTERS:
            return ("принадлежит", "связано")
        if pair & {EntityType.FACTS, EntityType.CLUES, EntityType.ARTIFACTS, EntityType.THEORIES}:
            return ("связано", "источник", "подтверждает", "опровергает")
        return ("связано",)

    def validate(self, source: EntityType, target: EntityType, label: str) -> None:
        if label == self.FACTION_CHILD and not (
            source is EntityType.FACTIONS and target is EntityType.FACTIONS
        ):
            raise ValueError(
                "Связь «Дочерняя фракция» доступна только между фракциями."
            )
