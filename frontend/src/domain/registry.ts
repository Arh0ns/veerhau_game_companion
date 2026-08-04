import type { ChronicleRecord, EntityType, Relationship } from "./types";
import { GRAPH_CONTENT_TYPES, GRAPH_IMPORTANCE } from "./graph-style";

export type FieldKind =
  | "text"
  | "textarea"
  | "date"
  | "time"
  | "select"
  | "searchSelect"
  | "tokenList"
  | "disposition"
  | "ref"
  | "multiRef"
  | "relationshipSet"
  | "checkbox";

export interface FieldDefinition {
  key: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  wide?: boolean;
  options?: readonly string[];
  entity?: EntityType;
  filter?: (record: ChronicleRecord) => boolean;
  relationLabel?: string;
  currentRole?: "source" | "target";
  visibleWhen?: { field: string; values: readonly string[] };
  placeholder?: string;
}

export interface EntityDefinition {
  type: EntityType;
  label: string;
  singular: string;
  description: string;
  fields: readonly FieldDefinition[];
  title(record: ChronicleRecord): string;
  summary(record: ChronicleRecord): string;
  navigation?: boolean;
  boardable?: boolean;
  graphable?: boolean;
}

const UNKNOWN = "Не известно";

export const OPTIONS = {
  characterType: ["Игровой персонаж", "NPC"],
  characterStatus: ["Активен", "Пропал", "Мёртв", "Вне сцены", "Неизвестно"],
  characterSpecies: [UNKNOWN, "Вампир", "Человек", "Гару", "Маг", "Фея", "Демон"],
  vampireClan: [UNKNOWN, "Бруха", "Вентру", "Тореадор", "Малкавиан", "Носферату", "Тремер", "Гангрел", "Ласомбра", "Цимисхи", "Ассамиты", "Равнос", "Салюбри", "Каитифф", "Тонкокровный"],
  garouTribe: [UNKNOWN, "Чёрные Фурии", "Костегрызы", "Дети Геи", "Фианна", "Потомки Фенрира", "Стеклоходы", "Красные Когти", "Повелители Тени", "Молчаливые Странники", "Серебряные Клыки", "Звездочёты", "Уктена", "Вендиго"],
  reliability: ["Подтверждено", "Вероятно", "Сомнительно", "Ложь", "Неизвестно"],
  storylineStatus: ["Активна", "Пауза", "Закрыта", "Провалена"],
  theoryStatus: ["Черновик", "Обсуждается", "Подтверждена", "Опровергнута"],
  citySect: ["Камарилья", "Шабаш", "Анархи", UNKNOWN],
  graphImportance: GRAPH_IMPORTANCE,
  contentType: GRAPH_CONTENT_TYPES,
} as const;

function value(record: ChronicleRecord, key: string): string {
  const raw = record[key];
  return typeof raw === "string" ? raw : "";
}

function fallbackTitle(record: ChronicleRecord): string {
  return value(record, "name") || value(record, "title") || value(record, "statement") || "Без названия";
}

const definitions: EntityDefinition[] = [
  {
    type: "campaigns", label: "Кампания", singular: "Кампания", description: "Общая хроника и её сеттинг.", navigation: false,
    fields: [
      { key: "title", label: "Название", kind: "text", required: true },
      { key: "description", label: "Описание", kind: "textarea", wide: true },
      { key: "setting", label: "Сеттинг", kind: "text", wide: true },
    ], title: fallbackTitle, summary: (r) => value(r, "description") || value(r, "setting"),
  },
  {
    type: "coteries", label: "Котерия", singular: "Котерия", description: "Игровые персонажи и их общая база.", navigation: false, graphable: true,
    fields: [
      { key: "name", label: "Название", kind: "text", required: true },
      { key: "description", label: "Описание", kind: "textarea", wide: true },
      { key: "goals", label: "Общие цели", kind: "textarea", wide: true },
      { key: "haven", label: "Убежище / база", kind: "text", wide: true },
      { key: "members", label: "Персонажи игроков", kind: "relationshipSet", entity: "characters", relationLabel: "член", currentRole: "source", filter: (r) => value(r, "characterType") === "Игровой персонаж", wide: true },
      { key: "notes", label: "Заметки", kind: "textarea", wide: true },
    ], title: fallbackTitle, summary: (r) => value(r, "description") || value(r, "goals"),
  },
  {
    type: "characters", label: "Персонажи", singular: "Персонаж", description: "Игровые персонажи и NPC.", navigation: true, boardable: true, graphable: true,
    fields: [
      { key: "name", label: "Имя", kind: "text", required: true },
      { key: "characterType", label: "Тип", kind: "select", options: OPTIONS.characterType },
      { key: "species", label: "Вид", kind: "select", options: OPTIONS.characterSpecies },
      { key: "vampireClan", label: "Клан", kind: "searchSelect", options: OPTIONS.vampireClan, visibleWhen: { field: "species", values: ["Вампир"] } },
      { key: "garouTribe", label: "Племя", kind: "searchSelect", options: OPTIONS.garouTribe, visibleWhen: { field: "species", values: ["Гару"] } },
      { key: "status", label: "Статус", kind: "select", options: OPTIONS.characterStatus },
      { key: "importance", label: "Важность", kind: "select", options: OPTIONS.graphImportance },
      { key: "knownAbilities", label: "Известные способности", kind: "tokenList", placeholder: "Дисциплины, дары, сферы...", wide: true },
      { key: "systemTags", label: "Отношение к котерии", kind: "disposition", visibleWhen: { field: "characterType", values: ["NPC"] } },
      { key: "coterie", label: "Котерия", kind: "relationshipSet", entity: "coteries", relationLabel: "член", currentRole: "target" },
      { key: "faction", label: "Фракция", kind: "relationshipSet", entity: "factions", relationLabel: "член", currentRole: "target" },
      { key: "description", label: "Описание", kind: "textarea", wide: true },
      { key: "notes", label: "Заметки", kind: "textarea", wide: true },
    ], title: fallbackTitle, summary: (r) => value(r, "description") || value(r, "notes"),
  },
  {
    type: "factions", label: "Фракции", singular: "Фракция", description: "Организации, участники, союзники и враги.", navigation: true, boardable: true, graphable: true,
    fields: [
      { key: "name", label: "Название", kind: "text", required: true },
      { key: "factionType", label: "Тип", kind: "text", placeholder: "клан, культ, корпорация..." },
      { key: "sect", label: "Секта", kind: "select", options: OPTIONS.citySect },
      { key: "description", label: "Описание", kind: "textarea", wide: true },
      { key: "goals", label: "Цели", kind: "textarea", wide: true },
      { key: "isSecondary", label: "Второстепенная фракция", kind: "checkbox" },
      { key: "mainFactionId", label: "Основная фракция", kind: "ref", entity: "factions", filter: (r) => !Boolean(r.isSecondary), visibleWhen: { field: "isSecondary", values: ["true"] } },
      { key: "systemTags", label: "Отношение к котерии", kind: "disposition" },
      { key: "members", label: "Участники", kind: "relationshipSet", entity: "characters", relationLabel: "член", currentRole: "source", wide: true },
      { key: "allies", label: "Союзники", kind: "relationshipSet", entity: "factions", relationLabel: "союзник", currentRole: "source" },
      { key: "enemies", label: "Противники", kind: "relationshipSet", entity: "factions", relationLabel: "враг", currentRole: "source" },
      { key: "children", label: "Дочерние фракции", kind: "relationshipSet", entity: "factions", relationLabel: "Дочерняя фракция", currentRole: "source" },
      { key: "notes", label: "Заметки", kind: "textarea", wide: true },
    ], title: fallbackTitle, summary: (r) => value(r, "description") || value(r, "goals"),
  },
  {
    type: "locations", label: "Локации", singular: "Локация", description: "Города и места в городе.", navigation: true, boardable: true, graphable: true,
    fields: [
      { key: "name", label: "Название", kind: "text", required: true },
      { key: "level", label: "Уровень", kind: "select", options: ["Город", "Место в городе"] },
      { key: "parentCityId", label: "Город", kind: "ref", entity: "locations", relationLabel: "находится в", currentRole: "source", filter: (r) => value(r, "level") === "Город", visibleWhen: { field: "level", values: ["Место в городе"] } },
      { key: "sect", label: "Секта", kind: "select", options: OPTIONS.citySect, visibleWhen: { field: "level", values: ["Город"] } },
      { key: "factionId", label: "Фракция", kind: "ref", entity: "factions", relationLabel: "принадлежит", currentRole: "source", visibleWhen: { field: "level", values: ["Город"] } },
      { key: "description", label: "Описание", kind: "textarea", wide: true },
      { key: "notes", label: "Заметки", kind: "textarea", wide: true },
    ], title: fallbackTitle, summary: (r) => value(r, "description") || value(r, "notes"),
  },
  {
    type: "events", label: "События", singular: "Событие", description: "Хронология произошедшего.", navigation: true, boardable: true, graphable: true,
    fields: [
      { key: "title", label: "Название", kind: "text", required: true },
      { key: "gameDate", label: "Игровая дата", kind: "date" },
      { key: "gameTime", label: "Время", kind: "time" },
      { key: "importance", label: "Важность", kind: "select", options: OPTIONS.graphImportance },
      { key: "contentType", label: "Тип материала", kind: "select", options: OPTIONS.contentType },
      { key: "cityId", label: "Город", kind: "ref", entity: "locations", filter: (r) => value(r, "level") === "Город" },
      { key: "placeId", label: "Место", kind: "ref", entity: "locations", filter: (r) => value(r, "level") === "Место в городе" },
      { key: "participants", label: "Участники", kind: "relationshipSet", entity: "characters", relationLabel: "участник", currentRole: "source", wide: true },
      { key: "description", label: "Описание", kind: "textarea", wide: true },
      { key: "consequence", label: "Последствия", kind: "textarea", wide: true },
      { key: "notes", label: "Заметки", kind: "textarea", wide: true },
    ], title: fallbackTitle, summary: (r) => value(r, "description") || value(r, "consequence"),
  },
  {
    type: "facts", label: "Факты", singular: "Факт", description: "Установленные сведения и их источники.", navigation: true, boardable: true, graphable: true,
    fields: [
      { key: "statement", label: "Формулировка", kind: "textarea", required: true, wide: true },
      { key: "source", label: "Источник", kind: "text" },
      { key: "reliability", label: "Достоверность", kind: "select", options: OPTIONS.reliability },
      { key: "importance", label: "Важность", kind: "select", options: OPTIONS.graphImportance },
      { key: "contentType", label: "Тип материала", kind: "select", options: OPTIONS.contentType },
      { key: "eventId", label: "Связанное событие", kind: "ref", entity: "events" },
      { key: "notes", label: "Заметки", kind: "textarea", wide: true },
    ], title: fallbackTitle, summary: (r) => value(r, "source") || value(r, "notes"),
  },
  {
    type: "clues", label: "Улики", singular: "Улика", description: "Материальные и косвенные улики.", navigation: true, boardable: true, graphable: true,
    fields: [
      { key: "title", label: "Название", kind: "text", required: true },
      { key: "clueType", label: "Тип", kind: "text" },
      { key: "source", label: "Источник", kind: "text" },
      { key: "reliability", label: "Достоверность", kind: "select", options: OPTIONS.reliability },
      { key: "eventId", label: "Связанное событие", kind: "ref", entity: "events" },
      { key: "discoveredByIds", label: "Кем обнаружена", kind: "multiRef", entity: "characters", wide: true },
      { key: "description", label: "Описание", kind: "textarea", wide: true },
      { key: "notes", label: "Заметки", kind: "textarea", wide: true },
    ], title: fallbackTitle, summary: (r) => value(r, "description") || value(r, "source"),
  },
  {
    type: "storylines", label: "Сюжетные линии", singular: "Сюжетная линия", description: "Активные дела и открытые вопросы.", navigation: true, boardable: true, graphable: true,
    fields: [
      { key: "title", label: "Название", kind: "text", required: true },
      { key: "status", label: "Статус", kind: "select", options: OPTIONS.storylineStatus },
      { key: "description", label: "Описание", kind: "textarea", wide: true },
      { key: "openQuestions", label: "Открытые вопросы", kind: "textarea", wide: true },
      { key: "notes", label: "Заметки", kind: "textarea", wide: true },
    ], title: fallbackTitle, summary: (r) => value(r, "description") || value(r, "openQuestions"),
  },
  {
    type: "theories", label: "Теории", singular: "Теория", description: "Ручные версии игроков.", navigation: true, boardable: true, graphable: true,
    fields: [
      { key: "title", label: "Название", kind: "text", required: true },
      { key: "authorId", label: "От лица члена котерии", kind: "ref", entity: "characters", required: true, filter: (r) => value(r, "characterType") === "Игровой персонаж" },
      { key: "status", label: "Статус", kind: "select", options: OPTIONS.theoryStatus },
      { key: "relatedFacts", label: "Связанные факты", kind: "relationshipSet", entity: "facts", relationLabel: "связано", currentRole: "source", wide: true },
      { key: "relatedClues", label: "Связанные улики", kind: "relationshipSet", entity: "clues", relationLabel: "связано", currentRole: "source", wide: true },
      { key: "relatedEvents", label: "Связанные события", kind: "relationshipSet", entity: "events", relationLabel: "связано", currentRole: "source", wide: true },
      { key: "relatedCharacters", label: "Связанные персонажи", kind: "relationshipSet", entity: "characters", relationLabel: "связано", currentRole: "source", wide: true },
      { key: "relatedFactions", label: "Связанные фракции", kind: "relationshipSet", entity: "factions", relationLabel: "связано", currentRole: "source", wide: true },
      { key: "description", label: "Описание", kind: "textarea", wide: true },
      { key: "notes", label: "Заметки", kind: "textarea", wide: true },
    ], title: fallbackTitle, summary: (r) => value(r, "description") || value(r, "notes"),
  },
  {
    type: "notes", label: "Заметки", singular: "Заметка", description: "Рабочие заметки доски.", navigation: false, boardable: true, graphable: true,
    fields: [
      { key: "title", label: "Название", kind: "text", required: true },
      { key: "authorId", label: "От лица члена котерии", kind: "ref", entity: "characters", required: true, filter: (r) => value(r, "characterType") === "Игровой персонаж" },
      { key: "text", label: "Текст", kind: "textarea", wide: true },
      { key: "notes", label: "Примечания", kind: "textarea", wide: true },
    ], title: fallbackTitle, summary: (r) => value(r, "text") || value(r, "notes"),
  },
  {
    type: "memoirs", label: "Мемуары", singular: "Запись мемуаров", description: "Личные записи игровых персонажей.", navigation: false, boardable: false, graphable: false,
    fields: [
      { key: "authorId", label: "Автор", kind: "ref", entity: "characters", required: true, filter: (r) => value(r, "characterType") === "Игровой персонаж" },
      { key: "entryDate", label: "Дата", kind: "date" },
      { key: "mood", label: "Настроение", kind: "text" },
      { key: "text", label: "Текст", kind: "textarea", required: true, wide: true },
      { key: "plans", label: "Планы", kind: "textarea", wide: true },
      { key: "suspicions", label: "Подозрения", kind: "textarea", wide: true },
      { key: "eventIds", label: "События", kind: "multiRef", entity: "events", wide: true },
      { key: "characterIds", label: "Персонажи", kind: "multiRef", entity: "characters", wide: true },
    ], title: (r) => value(r, "entryDate") || "Запись без даты", summary: (r) => value(r, "text") || value(r, "suspicions"),
  },
  {
    type: "investigationBoards", label: "Доски расследования", singular: "Доска", description: "Именованные доски расследований.", navigation: false,
    fields: [
      { key: "name", label: "Название", kind: "text", required: true },
      { key: "status", label: "Статус", kind: "select", options: ["Активна", "Архив"] },
      { key: "storylineId", label: "Сюжетная линия", kind: "ref", entity: "storylines" },
      { key: "description", label: "Описание", kind: "textarea", wide: true },
    ], title: fallbackTitle, summary: (r) => value(r, "description"),
  },
  {
    type: "graphLayouts", label: "Раскладки графа", singular: "Раскладка", description: "Служебная раскладка графа.", navigation: false,
    fields: [], title: fallbackTitle, summary: () => "",
  },
  {
    type: "tagDefinitions", label: "Справочник тегов", singular: "Тег", description: "Рекомендуемые теги хроники.", navigation: false,
    fields: [], title: fallbackTitle, summary: (r) => value(r, "description"),
  },
  {
    type: "entityTemplates", label: "Шаблоны", singular: "Шаблон", description: "Шаблоны создания сущностей.", navigation: false,
    fields: [], title: fallbackTitle, summary: () => "",
  },
  {
    type: "savedSearches", label: "Сохранённые поиски", singular: "Сохранённый поиск", description: "Именованные поисковые запросы.", navigation: false,
    fields: [], title: fallbackTitle, summary: (r) => value(r, "query"),
  },
  {
    type: "bookmarks", label: "Закладки", singular: "Закладка", description: "Быстрые ссылки хроники.", navigation: false,
    fields: [], title: fallbackTitle, summary: () => "",
  },
];

const taggable = new Set<EntityType>(["coteries", "characters", "factions", "locations", "events", "facts", "clues", "storylines", "theories", "notes", "memoirs"]);
for (const definition of definitions) {
  if (!taggable.has(definition.type)) continue;
  if (definition.graphable && !definition.fields.some((field) => field.key === "importance")) {
    definition.fields = [
      ...definition.fields.slice(0, 1),
      { key: "importance", label: "Важность", kind: "select", options: OPTIONS.graphImportance },
      ...definition.fields.slice(1),
    ];
  }
  const metadata: FieldDefinition[] = [
    { key: "tags", label: "Теги", kind: "tokenList", wide: true, placeholder: "город/прага, дело/князь" },
  ];
  if (definition.type !== "memoirs") metadata.push({ key: "aliases", label: "Псевдонимы", kind: "tokenList", wide: true, placeholder: "Другие имена через запятую" });
  definition.fields = [...definition.fields, ...metadata];
}

export class EntityRegistry {
  private readonly definitions = new Map(definitions.map((definition) => [definition.type, definition]));

  get(type: EntityType): EntityDefinition {
    const definition = this.definitions.get(type);
    if (!definition) throw new Error(`Неизвестная сущность: ${type}`);
    return definition;
  }

  navigation(): EntityDefinition[] {
    return definitions.filter((definition) => definition.navigation);
  }

  boardable(): EntityDefinition[] {
    return definitions.filter((definition) => definition.boardable);
  }

  graphable(): EntityDefinition[] {
    return definitions.filter((definition) => definition.graphable);
  }

  searchable(): EntityDefinition[] {
    return definitions.filter((definition) => taggable.has(definition.type));
  }
}

export class EntityChoicePolicy {
  readonly boardPrimary: EntityType[] = ["events", "facts", "clues", "theories", "notes"];
  readonly boardMore: EntityType[] = ["characters", "factions", "locations", "storylines"];
  readonly linkable: EntityType[] = ["campaigns", "coteries", "characters", "factions", "locations", "events", "facts", "clues", "storylines", "theories", "notes", "memoirs"];

  private readonly recommended: Partial<Record<EntityType, EntityType[]>> = {
    characters: ["characters", "factions", "coteries", "events", "clues"],
    factions: ["characters", "factions", "coteries", "locations", "storylines"],
    events: ["characters", "locations", "facts", "clues", "storylines"],
    facts: ["events", "clues", "theories", "characters", "storylines"],
    clues: ["events", "facts", "theories", "characters", "storylines"],
    theories: ["facts", "clues", "events", "characters", "factions", "storylines"],
    storylines: ["events", "facts", "clues", "theories", "factions"],
    locations: ["events", "characters", "factions", "locations", "storylines"],
  };

  targets(source: EntityType): { recommended: EntityType[]; more: EntityType[] } {
    const recommended = this.recommended[source] ?? this.linkable.slice(0, 5);
    return { recommended, more: this.linkable.filter((type) => !recommended.includes(type)) };
  }
}

export class RelationshipLabelPolicy {
  presets(source: EntityType, target: EntityType): string[] {
    if (source === "factions" && target === "factions") return ["связано", "союзник", "враг", "Дочерняя фракция"];
    const pair = new Set([source, target]);
    if ([...pair].every((type) => ["characters", "factions", "coteries"].includes(type))) return ["связано", "член", "союзник", "враг"];
    if (pair.has("events") && pair.has("locations")) return ["связано", "произошло в"];
    if ([...pair].some((type) => ["facts", "clues", "theories"].includes(type))) return ["связано", "источник", "подтверждает", "опровергает"];
    return ["связано"];
  }

  selectedPreset(relationship: Relationship | undefined, source: EntityType, target: EntityType): string {
    const label = relationship?.relationLabel || "связано";
    return this.presets(source, target).includes(label) ? label : "__custom";
  }
}
