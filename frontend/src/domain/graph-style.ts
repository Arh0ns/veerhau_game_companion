import { CoterieDispositionPolicy } from "./coterie-disposition";
import type { ChronicleRecord, EntityType, GraphEntityTypeStyle, GraphMode, GraphModeStyle, GraphNodePlacement } from "./types";

const FONT_SANS = "Inter, ui-sans-serif, system-ui, sans-serif";

export const GRAPH_IMPORTANCE = ["Высокая", "Обычная", "Низкая"] as const;
export const GRAPH_CONTENT_TYPES = ["Сюжетное", "Личное", "Лорное"] as const;
export const GRAPH_UNCLASSIFIED = "Без типа";
export const GRAPH_SECTS = ["Камарилья", "Шабаш", "Анархи", "Не известно"] as const;

export interface GraphStyleTarget {
  key: string;
  label: string;
  entity: EntityType;
  recordPatch: Record<string, unknown>;
}

export function knownGraphSubtypes(entity: EntityType): readonly GraphStyleTarget[] {
  if (entity === "factions") return GRAPH_SECTS.map((sect) => ({
    key: `${entity}::sect=${sect}`,
    label: `Секта: ${sect}`,
    entity,
    recordPatch: { sect },
  }));
  return [];
}

export function globalGraphStyleTargets(): readonly GraphStyleTarget[] {
  return GRAPH_IMPORTANCE.map((importance) => ({
    key: `importance=${importance}`,
    label: `Важность: ${importance}`,
    entity: "characters" as const,
    recordPatch: { importance },
  }));
}

const ENTITY_COLORS: Partial<Record<EntityType, string>> = {
  coteries: "#62b5e5",
  factions: "#8f1d2c",
  characters: "#6a3037",
  events: "#6f91c4",
  facts: "#43809b",
  theories: "#86558f",
  locations: "#aeb6c2",
  clues: "#9b7b35",
  artifacts: "#aeb6c2",
};

export const CITY_SECT_BORDER_COLORS: Readonly<Record<string, string>> = {
  "Камарилья": "#3f78b5",
  "Шабаш": "#b23a48",
  "Анархи": "#737982",
};

export function defaultGraphModeStyle(mode: GraphMode): GraphModeStyle {
  return {
    fontFamily: FONT_SANS,
    labelSize: mode === "custom" ? 13 : 11,
    labelWeight: mode === "custom" ? 600 : 500,
    labelItalic: false,
    labelOutline: true,
    edgeLabels: true,
    edgeLabelSize: mode === "custom" ? 11 : 9,
    backgroundColor: "#090b0f",
    gridColor: "#28303b",
    gridOpacity: mode === "custom" ? 0.38 : 0.18,
    edgeColor: "#737982",
    edgeWidth: mode === "custom" ? 1.6 : 1,
    edgeOpacity: mode === "custom" ? 0.78 : 0.5,
    nodeScale: 1,
    physics: { centerForce: 0, repelForce: 1, linkForce: 1, linkDistance: mode === "custom" ? 155 : 78 },
    entityTypeStyles: {},
  };
}

export interface ResolvedGraphNodeStyle {
  color: string;
  textColor: string;
  borderColor: string;
  borderStyle: "solid" | "dashed" | "dotted";
  borderWidth: number;
  fontFamily: string;
  labelSize: number;
  labelWeight: number;
  scale: number;
  mass: number;
}

export class GraphStyleResolver {
  private readonly dispositions = new CoterieDispositionPolicy();

  mode(raw: Partial<GraphModeStyle> | undefined, mode: GraphMode): GraphModeStyle {
    const defaults = defaultGraphModeStyle(mode);
    return {
      ...defaults,
      ...(raw ?? {}),
      physics: { ...defaults.physics, ...(raw?.physics ?? {}) },
      entityTypeStyles: { ...(raw?.entityTypeStyles ?? {}) },
    };
  }

  node(
    entity: EntityType,
    record: ChronicleRecord,
    placement: GraphNodePlacement,
    modeStyle: GraphModeStyle,
    contextColor = "",
  ): ResolvedGraphNodeStyle {
    const typeStyle: GraphEntityTypeStyle = modeStyle.entityTypeStyles[entity] ?? {};
    const sect = entity === "factions" ? String(record.sect || "Не известно") : "";
    const sectStyle: GraphEntityTypeStyle = sect ? modeStyle.entityTypeStyles[`${entity}::sect=${sect}`] ?? {} : {};
    const importance = String(record.importance || "Обычная");
    const importanceStyle: GraphEntityTypeStyle = modeStyle.entityTypeStyles[`importance=${importance}`] ?? {};
    const resolvedTypeStyle = { ...typeStyle, ...sectStyle };
    const dispositionColor = entity === "characters" || entity === "factions"
      ? this.dispositions.read(record)?.color
      : undefined;
    const locationColor = entity === "locations"
      ? (record.level === "Город" ? "#c8a85a" : "#aeb6c2")
      : undefined;
    const citySectBorderColor = entity === "locations" && record.level === "Город"
      ? CITY_SECT_BORDER_COLORS[String(record.sect || "")]
      : undefined;
    const color = placement.color || contextColor || dispositionColor || sectStyle.color || typeStyle.color || locationColor || ENTITY_COLORS[entity] || "#4f5665";
    return {
      color,
      textColor: placement.textColor || resolvedTypeStyle.textColor || "#f4f4f2",
      borderColor: placement.borderColor || citySectBorderColor || importanceStyle.borderColor || resolvedTypeStyle.borderColor || (entity === "coteries" ? "#c8a85a" : "#7d6a47"),
      borderStyle: placement.borderStyle || importanceStyle.borderStyle || resolvedTypeStyle.borderStyle || "solid",
      borderWidth: placement.borderWidth || importanceStyle.borderWidth || resolvedTypeStyle.borderWidth || 1.5,
      fontFamily: resolvedTypeStyle.fontFamily || modeStyle.fontFamily,
      labelSize: resolvedTypeStyle.labelSize || modeStyle.labelSize,
      labelWeight: resolvedTypeStyle.labelWeight || modeStyle.labelWeight,
      scale: Math.max(0.35, Math.min(8, (placement.scale || 1) * modeStyle.nodeScale * (typeStyle.scale || 1) * (sectStyle.scale || 1) * (importanceStyle.scale || 1))),
      mass: Math.max(0.25, Math.min(32, (typeStyle.mass || 1) * (sectStyle.mass || 1) * (importanceStyle.mass || 1))),
    };
  }
}
