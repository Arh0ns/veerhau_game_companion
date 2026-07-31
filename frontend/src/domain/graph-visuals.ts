import type { EntityType, GraphMode } from "./types";

export type GraphShape = "circle" | "square" | "hexagon" | "triangle" | "star" | "diamond";

export interface GraphNodeVisual {
  shape: GraphShape;
  radius: number;
}

export function graphNodeVisual(entity: EntityType, mode: GraphMode, scale = 1, variant = ""): GraphNodeVisual {
  if (mode === "custom") {
    const compact = graphNodeVisual(entity, "obsidian", scale, variant);
    const multiplier = entity === "coteries" ? 1.7 : 2.15;
    return { shape: compact.shape, radius: compact.radius * multiplier };
  }
  switch (entity) {
    case "coteries": return { shape: "circle", radius: 20 * scale };
    case "factions": return { shape: "circle", radius: 16 * scale };
    case "characters": return { shape: "circle", radius: 10 * scale };
    case "events": return { shape: "hexagon", radius: 13 * scale };
    case "facts": return { shape: "square", radius: 11 * scale };
    case "theories": return { shape: "triangle", radius: 13 * scale };
    case "locations": return { shape: "star", radius: (variant === "city" ? 15 : 8) * scale };
    case "clues": return { shape: "diamond", radius: 12 * scale };
    default: return { shape: "square", radius: 10 * scale };
  }
}

export function regularPolygonPoints(sides: number, radius: number, rotation = -Math.PI / 2): string {
  return Array.from({ length: sides }, (_, index) => {
    const angle = rotation + index / sides * Math.PI * 2;
    return `${Math.cos(angle) * radius},${Math.sin(angle) * radius}`;
  }).join(" ");
}

export function starPoints(radius: number): string {
  const inner = radius * 0.43;
  return Array.from({ length: 10 }, (_, index) => {
    const angle = -Math.PI / 2 + index / 10 * Math.PI * 2;
    const current = index % 2 === 0 ? radius : inner;
    return `${Math.cos(angle) * current},${Math.sin(angle) * current}`;
  }).join(" ");
}
