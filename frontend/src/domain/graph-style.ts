import { CoterieDispositionPolicy } from "./coterie-disposition";
import type { ChronicleRecord, EntityType, GraphEntityTypeStyle, GraphMode, GraphModeStyle, GraphNodePlacement } from "./types";

const FONT_SANS = "Inter, ui-sans-serif, system-ui, sans-serif";

const ENTITY_COLORS: Partial<Record<EntityType, string>> = {
  coteries: "#62b5e5",
  factions: "#8f1d2c",
  characters: "#6a3037",
  events: "#6f91c4",
  facts: "#43809b",
  theories: "#86558f",
  locations: "#aeb6c2",
  clues: "#9b7b35",
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
  fontFamily: string;
  labelSize: number;
  labelWeight: number;
  scale: number;
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
    const dispositionColor = entity === "characters" || entity === "factions"
      ? this.dispositions.read(record)?.color
      : undefined;
    const locationColor = entity === "locations"
      ? (record.level === "Город" ? "#c8a85a" : "#aeb6c2")
      : undefined;
    const color = placement.color || contextColor || dispositionColor || typeStyle.color || locationColor || ENTITY_COLORS[entity] || "#4f5665";
    return {
      color,
      textColor: placement.textColor || typeStyle.textColor || "#f4f4f2",
      borderColor: placement.borderColor || typeStyle.borderColor || (entity === "coteries" ? "#c8a85a" : "#7d6a47"),
      fontFamily: typeStyle.fontFamily || modeStyle.fontFamily,
      labelSize: typeStyle.labelSize || modeStyle.labelSize,
      labelWeight: typeStyle.labelWeight || modeStyle.labelWeight,
      scale: Math.max(0.35, Math.min(3, (placement.scale || 1) * modeStyle.nodeScale * (typeStyle.scale || 1))),
    };
  }
}
