import { describe, expect, it } from "vitest";
import { activeGraphModeLayout, normalizeGraphModeLayouts, shouldPinMovedGraphNode } from "./graph-layout-state";
import type { GraphLayout } from "./types";

const legacyLayout = {
  id: "graph",
  name: "Main graph",
  nodes: [{ entity: "characters", id: "npc", x: 120, y: 80, scale: 1, pinned: true }],
  viewport: { x: 10, y: 20, zoom: 1.4 },
  mode: "custom",
  filters: {},
  modeStyles: {},
  createdAt: "",
  updatedAt: "",
} as GraphLayout;

describe("graph mode layouts", () => {
  it("migrates legacy coordinates into independent mode spaces", () => {
    const modes = normalizeGraphModeLayouts(legacyLayout);
    modes.obsidian.nodes[0]!.x = 900;
    modes.obsidian.viewport.zoom = 0.5;
    expect(modes.custom.nodes[0]!.x).toBe(120);
    expect(modes.custom.viewport.zoom).toBe(1.4);
  });

  it("returns only the requested mode space", () => {
    const layout = { ...legacyLayout, modeLayouts: normalizeGraphModeLayouts(legacyLayout) };
    expect(activeGraphModeLayout(layout, "custom")).not.toBe(activeGraphModeLayout(layout, "obsidian"));
  });

  it("pins manual placements but releases Obsidian nodes back into physics", () => {
    expect(shouldPinMovedGraphNode("custom")).toBe(true);
    expect(shouldPinMovedGraphNode("obsidian")).toBe(false);
  });
});
