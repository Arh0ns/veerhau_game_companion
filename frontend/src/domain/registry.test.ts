import { describe, expect, it } from "vitest";
import { EntityChoicePolicy, EntityRegistry } from "./registry";

describe("entity registry policies", () => {
  it("allows characters and factions on investigation boards", () => {
    const choices = new EntityChoicePolicy();
    const boardTypes = [...choices.boardPrimary, ...choices.boardMore];
    expect(boardTypes).toContain("characters");
    expect(boardTypes).toContain("factions");
  });

  it("exposes theory links to evidence, events, characters and factions", () => {
    const fields = new EntityRegistry().get("theories").fields
      .filter((field) => field.kind === "relationshipSet")
      .map((field) => field.entity);
    expect(fields).toEqual(["facts", "clues", "events", "characters", "factions"]);
  });

  it("describes city ownership and the place-to-city relationship", () => {
    const fields = new EntityRegistry().get("locations").fields;
    expect(fields.find((field) => field.key === "parentCityId")?.relationLabel).toBe("находится в");
    expect(fields.find((field) => field.key === "sect")?.options).toEqual(["Камарилья", "Шабаш", "Анархи", "Не известно"]);
    expect(fields.find((field) => field.key === "factionId")?.relationLabel).toBe("принадлежит");
  });
});
