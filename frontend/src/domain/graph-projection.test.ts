import { describe, expect, it } from "vitest";
import { collapseSecondaryFactionRelationships, reachableNodeKeys } from "./graph-projection";
import type { Relationship } from "./types";

const relationships = [
  { id: "1", sourceType: "facts", sourceId: "a", targetType: "clues", targetId: "b" },
  { id: "2", sourceType: "clues", sourceId: "b", targetType: "theories", targetId: "c" },
] as Relationship[];

describe("reachableNodeKeys", () => {
  it("limits graph traversal by chain length", () => {
    expect([...reachableNodeKeys(relationships, "facts:a", 1)]).toEqual(["facts:a", "clues:b"]);
    expect(reachableNodeKeys(relationships, "facts:a", 2)).toEqual(new Set(["facts:a", "clues:b", "theories:c"]));
  });
});

describe("collapseSecondaryFactionRelationships", () => {
  it("redirects secondary faction edges to the main faction without self-links", () => {
    const projected = collapseSecondaryFactionRelationships([
      { id: "1", sourceType: "characters", sourceId: "npc", targetType: "factions", targetId: "minor", relationLabel: "member" },
      { id: "2", sourceType: "factions", sourceId: "minor", targetType: "factions", targetId: "main", relationLabel: "child" },
    ] as Relationship[], new Map([["minor", "main"]]));
    expect(projected).toHaveLength(1);
    expect(projected[0]).toMatchObject({ sourceType: "characters", sourceId: "npc", targetType: "factions", targetId: "main" });
  });
});
