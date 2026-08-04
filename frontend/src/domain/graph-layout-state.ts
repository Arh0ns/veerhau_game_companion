import type { GraphLayout, GraphMode, GraphModeLayout, GraphNodePlacement, Viewport } from "./types";

function cloneViewport(viewport: Viewport): Viewport {
  return { x: viewport.x, y: viewport.y, zoom: viewport.zoom };
}

function cloneNodes(nodes: GraphNodePlacement[], keepStyle: boolean): GraphNodePlacement[] {
  return nodes.map((node) => keepStyle ? { ...node } : {
    entity: node.entity,
    id: node.id,
    x: node.x,
    y: node.y,
    scale: 1,
    pinned: false,
  });
}

export function normalizeGraphModeLayouts(layout: GraphLayout): Record<GraphMode, GraphModeLayout> {
  if (layout.modeLayouts?.custom && layout.modeLayouts?.obsidian) {
    return {
      custom: { nodes: cloneNodes(layout.modeLayouts.custom.nodes, true), viewport: cloneViewport(layout.modeLayouts.custom.viewport) },
      obsidian: { nodes: cloneNodes(layout.modeLayouts.obsidian.nodes, false), viewport: cloneViewport(layout.modeLayouts.obsidian.viewport) },
    };
  }
  const legacyNodes = layout.nodes ?? [];
  const legacyViewport = layout.viewport ?? { x: 0, y: 0, zoom: 1 };
  return {
    custom: { nodes: cloneNodes(legacyNodes, true), viewport: cloneViewport(legacyViewport) },
    obsidian: { nodes: cloneNodes(legacyNodes, false), viewport: { x: 0, y: 0, zoom: 1 } },
  };
}

export function activeGraphModeLayout(layout: GraphLayout, mode: GraphMode): GraphModeLayout {
  layout.modeLayouts ??= normalizeGraphModeLayouts(layout);
  return layout.modeLayouts[mode];
}
