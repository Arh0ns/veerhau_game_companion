import { describe, expect, it } from "vitest";
import { graphNodeVisual } from "./graph-visuals";

describe("graphNodeVisual", () => {
  it("uses large semantic shapes in the configurable graph", () => {
    expect(graphNodeVisual("facts", "custom").shape).toBe("square");
    expect(graphNodeVisual("events", "custom").shape).toBe("hexagon");
    expect(graphNodeVisual("facts", "custom").radius).toBeGreaterThan(graphNodeVisual("facts", "obsidian").radius);
  });

  it("uses compact entity-specific Obsidian shapes", () => {
    expect(graphNodeVisual("events", "obsidian").shape).toBe("hexagon");
    expect(graphNodeVisual("facts", "obsidian").shape).toBe("square");
    expect(graphNodeVisual("theories", "obsidian").shape).toBe("triangle");
    expect(graphNodeVisual("locations", "obsidian").shape).toBe("star");
    expect(graphNodeVisual("locations", "obsidian").radius).toBeLessThan(graphNodeVisual("characters", "obsidian").radius);
    expect(graphNodeVisual("locations", "obsidian", 1, "city").radius).toBeGreaterThan(graphNodeVisual("characters", "obsidian").radius);
    expect(graphNodeVisual("factions", "obsidian").radius).toBeGreaterThan(graphNodeVisual("characters", "obsidian").radius);
  });
});
