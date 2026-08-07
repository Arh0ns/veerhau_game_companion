import { describe, expect, it } from "vitest";
import { confirmedTheoryFactPayload, replaceTheoryInRelationship, replaceTheoryNodeReferences } from "./theory-conversion";
import type { ChronicleRecord, Relationship } from "./types";

describe("confirmed theory conversion", () => {
  it("builds a confirmed fact without losing descriptive fields", () => {
    const payload = confirmedTheoryFactPayload({
      id: "theory_1",
      createdAt: "",
      updatedAt: "",
      title: "Князь покинул город",
      description: "Версия подтверждена свидетелем.",
      importance: "Высокая",
      tags: ["дело/князь"],
    } as ChronicleRecord);
    expect(payload).toMatchObject({
      statement: "Князь покинул город",
      description: "Версия подтверждена свидетелем.",
      reliability: "Подтверждено",
      importance: "Высокая",
      tags: ["дело/князь"],
    });
  });

  it("moves relationship endpoints from the theory to the fact", () => {
    const relationship = {
      id: "rel_1",
      sourceType: "characters",
      sourceId: "npc_1",
      targetType: "theories",
      targetId: "theory_1",
      relationLabel: "подтверждает",
      notes: "",
      edgeColor: "#737982",
      arrowDirection: "source-to-target",
      lineStyle: "solid",
      createdAt: "",
      updatedAt: "",
    } as Relationship;
    expect(replaceTheoryInRelationship(relationship, "theory_1", "fact_1")).toMatchObject({
      sourceType: "characters",
      sourceId: "npc_1",
      targetType: "facts",
      targetId: "fact_1",
      relationLabel: "подтверждает",
    });
  });

  it("keeps graph and board placement references when the entity type changes", () => {
    const original = {
      nodes: [{ entity: "theories", id: "theory_1", x: 12, y: 34 }],
      focusKey: "theories:theory_1",
    };
    expect(replaceTheoryNodeReferences(original, "theory_1", "fact_1")).toEqual({
      nodes: [{ entity: "facts", id: "fact_1", x: 12, y: 34 }],
      focusKey: "facts:fact_1",
    });
    expect(original.nodes[0]).toMatchObject({ entity: "theories", id: "theory_1" });
  });
});
