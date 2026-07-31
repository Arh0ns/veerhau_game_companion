import { describe, expect, it } from "vitest";
import { GraphStyleResolver, defaultGraphModeStyle } from "./graph-style";
import type { ChronicleRecord, GraphNodePlacement } from "./types";

const placement: GraphNodePlacement = { entity: "characters", id: "npc", x: 0, y: 0, scale: 1, pinned: false };
const record = { id: "npc", createdAt: "", updatedAt: "", systemTags: [{ namespace: "coterie-disposition", value: "ally", label: "Союзник", color: "#2f8f5b" }] } as ChronicleRecord;

describe("GraphStyleResolver", () => {
  it("uses disposition before the entity default", () => {
    const style = defaultGraphModeStyle("custom");
    style.entityTypeStyles.characters = { color: "#111111" };
    expect(new GraphStyleResolver().node("characters", record, placement, style).color).toBe("#2f8f5b");
  });

  it("keeps individual node color as the strongest override", () => {
    expect(new GraphStyleResolver().node("characters", record, { ...placement, color: "#abcdef" }, defaultGraphModeStyle("custom")).color).toBe("#abcdef");
  });

  it("uses the coterie member color when there is no individual override", () => {
    expect(new GraphStyleResolver().node("characters", { id: "pc", createdAt: "", updatedAt: "" }, placement, defaultGraphModeStyle("custom"), "#62b5e5").color).toBe("#62b5e5");
  });

  it("uses white labels by default even on light nodes", () => {
    const unknown = { id: "npc", createdAt: "", updatedAt: "", systemTags: [{ namespace: "coterie-disposition", value: "unknown", label: "Неизвестно", color: "#f4f4f2" }] } as ChronicleRecord;
    expect(new GraphStyleResolver().node("characters", unknown, placement, defaultGraphModeStyle("custom")).textColor).toBe("#f4f4f2");
  });

  it("uses gold for cities and silver for places by default", () => {
    const resolver = new GraphStyleResolver();
    const locationPlacement = { ...placement, entity: "locations" as const };
    expect(resolver.node("locations", { id: "city", level: "Город", createdAt: "", updatedAt: "" }, locationPlacement, defaultGraphModeStyle("custom")).color).toBe("#c8a85a");
    expect(resolver.node("locations", { id: "place", level: "Место в городе", createdAt: "", updatedAt: "" }, locationPlacement, defaultGraphModeStyle("custom")).color).toBe("#aeb6c2");
  });
});
