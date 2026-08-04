import { describe, expect, it } from "vitest";
import { weightedGraphForce, type SvgGraphNode } from "./svg-graph-scene";

const node = (key: string, mass: number): SvgGraphNode => ({
  key, mass, x: 0, y: 0, radius: 10, pinned: false, title: key, subtitle: "",
});

describe("weightedGraphForce", () => {
  it("moves a heavy node less and lets it attract a light node more", () => {
    const heavy = node("heavy", 4);
    const light = node("light", 1);
    expect(weightedGraphForce(2, heavy, light)).toBe(0.5);
    expect(weightedGraphForce(2, light, heavy)).toBe(8);
  });
});
