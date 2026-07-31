import { describe, expect, it } from "vitest";
import { defaultRelationshipColor } from "./relationship-style";

describe("relationship colors", () => {
  it("uses semantic defaults for allies and enemies", () => {
    expect(defaultRelationshipColor("враг")).toBe("#b23a48");
    expect(defaultRelationshipColor("СОЮЗНИК")).toBe("#2f8f5b");
    expect(defaultRelationshipColor("связано")).toBe("#737982");
  });
});
