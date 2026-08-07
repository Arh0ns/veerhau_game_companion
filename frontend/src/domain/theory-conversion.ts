import type { ChronicleRecord, Relationship } from "./types";

export function confirmedTheoryFactPayload(theory: ChronicleRecord): Record<string, unknown> {
  return {
    statement: String(theory.title || "Подтверждённая гипотеза"),
    description: String(theory.description || ""),
    source: "Подтверждённая гипотеза",
    reliability: "Подтверждено",
    importance: String(theory.importance || "Обычная"),
    notes: String(theory.notes || ""),
    tags: Array.isArray(theory.tags) ? theory.tags : [],
    aliases: Array.isArray(theory.aliases) ? theory.aliases : [],
    attachedRelationshipIds: Array.isArray(theory.attachedRelationshipIds) ? theory.attachedRelationshipIds : [],
  };
}

export function replaceTheoryInRelationship(
  relationship: Relationship,
  theoryId: string,
  factId: string,
): Partial<Relationship> {
  return {
    sourceType: relationship.sourceType === "theories" && relationship.sourceId === theoryId ? "facts" : relationship.sourceType,
    sourceId: relationship.sourceType === "theories" && relationship.sourceId === theoryId ? factId : relationship.sourceId,
    targetType: relationship.targetType === "theories" && relationship.targetId === theoryId ? "facts" : relationship.targetType,
    targetId: relationship.targetType === "theories" && relationship.targetId === theoryId ? factId : relationship.targetId,
    relationLabel: relationship.relationLabel,
    notes: relationship.notes,
    edgeColor: relationship.edgeColor,
    arrowDirection: relationship.arrowDirection,
    lineStyle: relationship.lineStyle,
  };
}

export function replaceTheoryNodeReferences(value: unknown, theoryId: string, factId: string): unknown {
  if (value === `theories:${theoryId}`) return `facts:${factId}`;
  if (Array.isArray(value)) return value.map((item) => replaceTheoryNodeReferences(item, theoryId, factId));
  if (!value || typeof value !== "object") return value;
  const source = value as Record<string, unknown>;
  const replaced = Object.fromEntries(
    Object.entries(source).map(([key, item]) => [key, replaceTheoryNodeReferences(item, theoryId, factId)]),
  );
  if (source.entity === "theories" && source.id === theoryId) {
    replaced.entity = "facts";
    replaced.id = factId;
  }
  return replaced;
}
