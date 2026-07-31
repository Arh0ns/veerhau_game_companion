import type { FieldDefinition } from "./registry";
import type { ChronicleRecord, EntityType, Relationship, SystemTag } from "./types";

const NAMESPACE_LABELS: Record<string, string> = {
  characterType: "тип персонажа",
  species: "вид",
  vampireClan: "клан",
  garouTribe: "племя",
  status: "статус",
  coterie: "котерия",
  faction: "фракция",
  members: "участник",
  allies: "союзник",
  enemies: "противник",
  children: "дочерняя фракция",
  level: "уровень локации",
  parentCityId: "город",
  sect: "секта",
  factionId: "фракция",
  cityId: "город",
  placeId: "место",
  participants: "участник",
  reliability: "достоверность",
  eventId: "событие",
  discoveredByIds: "обнаружил",
  authorId: "автор",
  eventIds: "событие",
  characterIds: "персонаж",
  storylineId: "сюжетная линия",
  relatedFacts: "факт",
  relatedClues: "улика",
  relatedEvents: "событие",
  relatedCharacters: "персонаж",
  relatedFactions: "фракция",
};

export function readSystemTags(record: ChronicleRecord | undefined): SystemTag[] {
  if (!record || !Array.isArray(record.systemTags)) return [];
  return record.systemTags.filter((item): item is SystemTag => Boolean(
    item && typeof item === "object" && "namespace" in item && "value" in item,
  ));
}

export function systemTagPath(tag: SystemTag): string {
  const rawNamespace = tag.namespace === "coterie-disposition"
    ? "отношение"
    : tag.namespace.startsWith("field:")
      ? tag.namespace.slice(6)
      : tag.namespace;
  const namespace = NAMESPACE_LABELS[rawNamespace] ?? rawNamespace;
  const value = (tag.label || tag.value).trim();
  return value ? `${namespace}/${value}`.toLocaleLowerCase("ru") : namespace.toLocaleLowerCase("ru");
}

export function mergeSystemTags(existing: SystemTag[], replacedNamespaces: Set<string>, generated: SystemTag[]): SystemTag[] {
  const result = existing.filter((tag) => !replacedNamespaces.has(tag.namespace));
  const seen = new Set(result.map((tag) => `${tag.namespace}\u0000${tag.value}`.toLocaleLowerCase("ru")));
  for (const tag of generated) {
    if (!tag.value) continue;
    const key = `${tag.namespace}\u0000${tag.value}`.toLocaleLowerCase("ru");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
  }
  return result;
}

export function projectStructuredTags(
  entity: EntityType,
  record: ChronicleRecord,
  fields: readonly FieldDefinition[],
  relationships: Relationship[],
  titleFor: (entity: EntityType, id: string) => string,
): SystemTag[] {
  const replaced = new Set<string>();
  const generated: SystemTag[] = [];
  const add = (field: FieldDefinition, values: string[]) => {
    const namespace = `field:${field.key}`;
    replaced.add(namespace);
    for (const value of values.filter(Boolean)) generated.push({
      namespace,
      value,
      label: field.entity ? titleFor(field.entity, value) : value,
      color: "",
    });
  };
  for (const field of fields) {
    if (field.visibleWhen && !field.visibleWhen.values.includes(String(record[field.visibleWhen.field] ?? ""))) continue;
    if (field.kind === "relationshipSet" && field.entity && field.relationLabel && field.currentRole) {
      const values = relationships.filter((relationship) => {
        if (relationship.relationLabel !== field.relationLabel) return false;
        if (field.currentRole === "source") return relationship.sourceType === entity && relationship.sourceId === record.id && relationship.targetType === field.entity;
        return relationship.targetType === entity && relationship.targetId === record.id && relationship.sourceType === field.entity;
      }).map((relationship) => field.currentRole === "source" ? relationship.targetId : relationship.sourceId);
      add(field, values);
    } else if (field.kind === "multiRef") {
      add(field, Array.isArray(record[field.key]) ? (record[field.key] as unknown[]).filter((value): value is string => typeof value === "string") : []);
    } else if (["select", "searchSelect", "ref"].includes(field.kind)) {
      const value = String(record[field.key] ?? "").trim();
      add(field, value ? [value] : []);
    }
  }
  return mergeSystemTags(readSystemTags(record), replaced, generated);
}

export function projectedSystemTagPaths(
  entity: EntityType,
  record: ChronicleRecord,
  fields: readonly FieldDefinition[],
  relationships: Relationship[],
  titleFor: (entity: EntityType, id: string) => string,
): string[] {
  return projectStructuredTags(entity, record, fields, relationships, titleFor).map(systemTagPath);
}
