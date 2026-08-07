import { describe, expect, it } from "vitest";
import { EntityChoicePolicy, EntityRegistry, RelationshipLabelPolicy } from "./registry";

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

  it("exposes graph classification and character abilities", () => {
    const registry = new EntityRegistry();
    expect(registry.get("characters").fields.find((field) => field.key === "knownAbilities")?.kind).toBe("tokenList");
    for (const entity of new EntityRegistry().graphable().map((definition) => definition.type)) {
      expect(registry.get(entity).fields.find((field) => field.key === "importance")?.options).toEqual(["Высокая", "Обычная", "Низкая"]);
    }
    for (const entity of ["events", "facts"] as const) {
      expect(registry.get(entity).fields.find((field) => field.key === "contentType")?.options).toEqual(["Сюжетное", "Личное", "Лорное"]);
    }
    expect(registry.get("factions").fields.find((field) => field.key === "isSecondary")?.kind).toBe("checkbox");
    expect(registry.get("factions").fields.find((field) => field.key === "mainFactionId")?.entity).toBe("factions");
    expect(registry.get("factions").fields.find((field) => field.key === "sect")?.options).toEqual(["Камарилья", "Шабаш", "Анархи", "Не известно"]);
  });

  it("provides a description section for every graph card", () => {
    const registry = new EntityRegistry();
    for (const definition of registry.graphable()) {
      expect(definition.fields.find((field) => field.key === "description")).toMatchObject({
        kind: "textarea",
        label: "Описание",
      });
    }
  });

  it("defines artifacts with a required character owner", () => {
    const definition = new EntityRegistry().get("artifacts");
    expect(definition).toMatchObject({ navigation: true, boardable: true, graphable: true });
    expect(definition.fields.find((field) => field.key === "ownerId")).toMatchObject({
      kind: "ref",
      entity: "characters",
      required: true,
      relationLabel: "владеет",
      currentRole: "target",
    });
    expect(definition.fields.find((field) => field.key === "description")?.required).not.toBe(true);
    expect(new RelationshipLabelPolicy().presets("characters", "artifacts")).toContain("владеет");
  });

  it("uses one character-to-event relationship from both entity forms", () => {
    const registry = new EntityRegistry();
    const characterEvents = registry.get("characters").fields.find((field) => field.key === "relatedEvents");
    const eventCharacters = registry.get("events").fields.find((field) => field.key === "relatedCharacters");

    expect(characterEvents).toMatchObject({
      kind: "relationshipSet",
      entity: "events",
      relationLabel: "связано",
      currentRole: "source",
      allowCreate: true,
    });
    expect(eventCharacters).toMatchObject({
      kind: "relationshipSet",
      entity: "characters",
      relationLabel: "связано",
      currentRole: "target",
    });
    expect(registry.get("events").fields.some((field) => field.key === "participants")).toBe(false);
  });
});
