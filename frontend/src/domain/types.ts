export const ENTITY_TYPES = [
  "campaigns",
  "coteries",
  "characters",
  "factions",
  "locations",
  "events",
  "facts",
  "clues",
  "storylines",
  "theories",
  "notes",
  "memoirs",
  "investigationBoards",
  "graphLayouts",
  "tagDefinitions",
  "entityTemplates",
  "savedSearches",
  "bookmarks",
  "mentionDismissals",
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];
export type PublicEntityType = Exclude<EntityType, "graphLayouts">;
export type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue | undefined };

export interface ChronicleRecord {
  [key: string]: unknown;
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface SystemTag {
  namespace: string;
  value: string;
  label: string;
  color: string;
}

export interface TagSummary {
  id: string;
  name: string;
  count: number;
  description: string;
  recommended: boolean;
}

export interface EntityRef {
  entityType: EntityType;
  entityId: string;
}

export interface Relationship {
  id: string;
  sourceType: EntityType;
  sourceId: string;
  targetType: EntityType;
  targetId: string;
  relationLabel: string;
  notes: string;
  edgeColor: string;
  arrowDirection: "" | "source-to-target" | "target-to-source";
  lineStyle: "solid" | "dashed";
  createdAt: string;
  updatedAt: string;
}

export interface BoardNode {
  entity: EntityType;
  id: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  color?: string;
  textColor?: string;
  borderColor?: string;
}

export interface BoardGroup {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  borderColor?: string;
  borderStyle?: "solid" | "dashed" | "dotted";
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface InvestigationBoard extends ChronicleRecord {
  name: string;
  description: string;
  status: string;
  storylineId: string;
  items: BoardNode[];
  groups: BoardGroup[];
  viewport: Viewport;
}

export interface GraphNodePlacement {
  entity: EntityType;
  id: string;
  x: number;
  y: number;
  scale: number;
  pinned: boolean;
  color?: string;
  textColor?: string;
  borderColor?: string;
}

export type GraphMode = "custom" | "obsidian";

export interface GraphPhysicsStyle {
  centerForce: number;
  repelForce: number;
  linkForce: number;
  linkDistance: number;
}

export interface GraphEntityTypeStyle {
  color?: string;
  borderColor?: string;
  textColor?: string;
  fontFamily?: string;
  labelSize?: number;
  labelWeight?: number;
  scale?: number;
}

export interface GraphModeStyle {
  fontFamily: string;
  labelSize: number;
  labelWeight: number;
  labelItalic: boolean;
  labelOutline: boolean;
  edgeLabels: boolean;
  edgeLabelSize: number;
  backgroundColor: string;
  gridColor: string;
  gridOpacity: number;
  edgeColor: string;
  edgeWidth: number;
  edgeOpacity: number;
  nodeScale: number;
  physics: GraphPhysicsStyle;
  entityTypeStyles: Partial<Record<EntityType, GraphEntityTypeStyle>>;
}

export interface GraphLayout extends ChronicleRecord {
  name: string;
  nodes: GraphNodePlacement[];
  viewport: Viewport;
  mode: GraphMode;
  filters: Record<string, unknown>;
  modeStyles: Record<GraphMode, GraphModeStyle>;
}

export type ChronicleSnapshot = {
  [key in EntityType]: ChronicleRecord[];
} & { relationships: Relationship[] };

export function entityKey(entity: EntityType, id: string): string {
  return `${entity}:${id}`;
}

export function parseEntityKey(key: string): EntityRef {
  const [entityType, ...idParts] = key.split(":");
  return { entityType: entityType as EntityType, entityId: idParts.join(":") };
}
