import type { Relationship } from "./types";

export const DEFAULT_EDGE_COLOR = "#737982";
export const ENEMY_EDGE_COLOR = "#b23a48";
export const ALLY_EDGE_COLOR = "#2f8f5b";

export function defaultRelationshipColor(label: string): string {
  const normalized = label.trim().toLocaleLowerCase("ru");
  if (normalized === "враг" || normalized === "enemy") return ENEMY_EDGE_COLOR;
  if (normalized === "союзник" || normalized === "ally") return ALLY_EDGE_COLOR;
  return DEFAULT_EDGE_COLOR;
}

export function relationshipColor(relationship: Pick<Relationship, "relationLabel" | "edgeColor">): string {
  return relationship.edgeColor || defaultRelationshipColor(relationship.relationLabel);
}
