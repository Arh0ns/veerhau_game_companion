import { describe, expect, it } from "vitest";
import { rectangleBoundaryPoint } from "./board-geometry";

describe("rectangleBoundaryPoint", () => {
  const node = { entity: "facts" as const, id: "fact_1", x: 100, y: 200, width: 280, height: 170 };

  it("places a horizontal edge on the card border", () => {
    expect(rectangleBoundaryPoint(node, { x: 800, y: 285 })).toEqual({ x: 380, y: 285 });
  });

  it("places a vertical edge on the card border", () => {
    expect(rectangleBoundaryPoint(node, { x: 240, y: 0 })).toEqual({ x: 240, y: 200 });
  });
});

