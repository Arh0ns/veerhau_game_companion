# Архитектура Chronicle

## Модульный Монолит

```mermaid
flowchart LR
    UI["TypeScript UI"] --> GW["HTTP gateways"]
    GW --> API["FastAPI /api/v1"]
    API --> APP["Application services"]
    APP --> PORTS["Repository ports"]
    PORTS --> SQLITE["SQLite adapters"]
    SQLITE --> DB[("records JSON + relationships")]
    APP --> DOMAIN["Domain models and policies"]
    SQLITE --> MAPPERS["RecordMapperRegistry"]
    MAPPERS --> DOMAIN
```

## Ключевые Классы

```mermaid
classDiagram
    direction TB

    class ChronicleEntity
    class Character
    class Faction
    class ChronicleEvent
    class Fact
    class Clue
    class Theory
    class InvestigationBoard
    class Relationship
    class BoardNode
    class GraphNodePlacement
    class RecordMapperRegistry
    class RecordRepository
    class RelationshipRepository
    class SQLiteRecordRepository
    class AppController
    class EntityController
    class BoardController
    class GraphController
    class SvgGraphScene

    ChronicleEntity <|-- Character
    ChronicleEntity <|-- Faction
    ChronicleEntity <|-- ChronicleEvent
    ChronicleEntity <|-- Fact
    ChronicleEntity <|-- Clue
    ChronicleEntity <|-- Theory
    ChronicleEntity <|-- InvestigationBoard
    InvestigationBoard *-- BoardNode
    RecordRepository <|.. SQLiteRecordRepository
    SQLiteRecordRepository --> RecordMapperRegistry
    AppController o-- EntityController
    AppController o-- BoardController
    AppController o-- GraphController
    GraphController o-- SvgGraphScene
    GraphController --> GraphNodePlacement
    GraphController --> Relationship
```

## Хранение Узлов

Игровые сущности не содержат координаты интерфейса.

- `InvestigationBoard.items[]` хранит `entity`, `id`, позицию, размер и стиль карточки только для конкретной доски.
- `graphLayouts.nodes[]` хранит `entity`, `id`, позицию, размер, стиль и `pinned` только для графа.
- запись сущности в `records` остаётся независимой от обеих визуальных раскладок.
- связь хранится один раз в таблице `relationships` и видна с обеих сторон.

## Ответственность Frontend

```mermaid
flowchart TB
    APP["AppController"] --> STORE["AppStore"]
    APP --> ENTITY["EntityController"]
    APP --> BOARD["BoardController"]
    APP --> GRAPH["GraphController"]
    GRAPH --> SCENE["SvgGraphScene"]
    ENTITY --> GATEWAY["Record and relationship gateways"]
    BOARD --> GATEWAY
    GRAPH --> GATEWAY
    SCENE --> GESTURES["pan / zoom / drag / force"]
```

`GraphController` решает, какие узлы показать и как сохранить настройки. `SvgGraphScene` не знает о FastAPI и формах: она управляет только SVG, координатами и жестами.
