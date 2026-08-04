import { describe, expect, it } from "vitest";
import { matchesGraphRecordFilters } from "./graph-filter";

describe("graph record filters", () => {
  const filters = { importance: new Set(["Высокая"]), contentTypes: new Set(["Сюжетное"]) };

  it("filters events and facts by importance and content type", () => {
    expect(matchesGraphRecordFilters("events", { id: "event", importance: "Высокая", contentType: "Сюжетное", createdAt: "", updatedAt: "" }, filters)).toBe(true);
    expect(matchesGraphRecordFilters("facts", { id: "fact", importance: "Низкая", contentType: "Сюжетное", createdAt: "", updatedAt: "" }, filters)).toBe(false);
  });

  it("filters every graph entity by importance", () => {
    expect(matchesGraphRecordFilters("characters", { id: "npc", importance: "Высокая", createdAt: "", updatedAt: "" }, filters)).toBe(true);
    expect(matchesGraphRecordFilters("characters", { id: "npc", createdAt: "", updatedAt: "" }, filters)).toBe(false);
    expect(matchesGraphRecordFilters("locations", { id: "city", createdAt: "", updatedAt: "" }, filters)).toBe(false);
    expect(matchesGraphRecordFilters("locations", { id: "city", importance: "Высокая", createdAt: "", updatedAt: "" }, filters)).toBe(true);
  });
});
