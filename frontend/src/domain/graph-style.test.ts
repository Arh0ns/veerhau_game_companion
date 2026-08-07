import { describe, expect, it } from "vitest";
import { CITY_SECT_BORDER_COLORS, GraphStyleResolver, defaultGraphModeStyle } from "./graph-style";
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

  it("uses silver for artifacts by default", () => {
    const artifactPlacement = { ...placement, entity: "artifacts" as const };
    expect(new GraphStyleResolver().node(
      "artifacts",
      { id: "relic", createdAt: "", updatedAt: "" },
      artifactPlacement,
      defaultGraphModeStyle("custom"),
    ).color).toBe("#aeb6c2");
  });

  it("colors city borders by sect", () => {
    const resolver = new GraphStyleResolver();
    const locationPlacement = { ...placement, entity: "locations" as const };
    for (const [sect, borderColor] of Object.entries(CITY_SECT_BORDER_COLORS)) {
      expect(resolver.node(
        "locations",
        { id: sect, level: "Город", sect, importance: "Высокая", createdAt: "", updatedAt: "" },
        locationPlacement,
        defaultGraphModeStyle("custom"),
      ).borderColor).toBe(borderColor);
    }
  });

  it("keeps an individual city border color as the strongest override", () => {
    const resolved = new GraphStyleResolver().node(
      "locations",
      { id: "city", level: "Город", sect: "Шабаш", createdAt: "", updatedAt: "" },
      { ...placement, entity: "locations", borderColor: "#abcdef" },
      defaultGraphModeStyle("custom"),
    );
    expect(resolved.borderColor).toBe("#abcdef");
  });

  it("supports an individual node border type and width", () => {
    const resolved = new GraphStyleResolver().node(
      "characters",
      record,
      { ...placement, borderStyle: "dotted", borderWidth: 4.5 },
      defaultGraphModeStyle("custom"),
    );
    expect(resolved.borderStyle).toBe("dotted");
    expect(resolved.borderWidth).toBe(4.5);
  });

  it("shows relationship names by default", () => {
    expect(defaultGraphModeStyle("custom").edgeLabels).toBe(true);
    expect(defaultGraphModeStyle("obsidian").edgeLabels).toBe(true);
  });

  it("multiplies the global importance layer over the entity style", () => {
    const style = defaultGraphModeStyle("custom");
    style.entityTypeStyles.factions = { scale: 2, mass: 1.5 };
    style.entityTypeStyles["importance=Высокая"] = { scale: 1.5, mass: 2 };
    const resolved = new GraphStyleResolver().node(
      "factions",
      { id: "faction", importance: "Высокая", createdAt: "", updatedAt: "" },
      { ...placement, entity: "factions" },
      style,
    );
    expect(resolved.scale).toBe(3);
    expect(resolved.mass).toBe(3);
  });

  it("uses importance only for border, scale and mass", () => {
    const style = defaultGraphModeStyle("custom");
    style.entityTypeStyles["importance=Высокая"] = {
      color: "#123456",
      textColor: "#654321",
      borderColor: "#abcdef",
      labelSize: 24,
    };
    const resolved = new GraphStyleResolver().node("characters", { ...record, importance: "Высокая" }, placement, style);
    expect(resolved.color).toBe("#2f8f5b");
    expect(resolved.textColor).toBe("#f4f4f2");
    expect(resolved.borderColor).toBe("#abcdef");
    expect(resolved.labelSize).toBe(style.labelSize);
  });

  it("uses faction sect styles instead of location sect styles", () => {
    const style = defaultGraphModeStyle("custom");
    style.entityTypeStyles["factions::sect=Камарилья"] = { scale: 1.25, color: "#445566" };
    const resolved = new GraphStyleResolver().node(
      "factions",
      { id: "court", sect: "Камарилья", createdAt: "", updatedAt: "" },
      { ...placement, entity: "factions" },
      style,
    );
    expect(resolved.scale).toBe(1.25);
    expect(resolved.color).toBe("#445566");
  });
});
