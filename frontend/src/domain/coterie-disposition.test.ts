import { describe, expect, it } from "vitest";
import { CoterieDispositionPolicy } from "./coterie-disposition";

describe("CoterieDispositionPolicy", () => {
  it("creates a hidden standard tag", () => {
    expect(new CoterieDispositionPolicy().toSystemTags("enemy")[0]).toEqual({
      namespace: "coterie-disposition",
      value: "enemy",
      label: "Враг",
      color: "#b23a48",
    });
  });

  it("keeps a custom label and color", () => {
    expect(new CoterieDispositionPolicy().toSystemTags("custom", "Должник", "#123456")[0]?.label).toBe("Должник");
  });
});
