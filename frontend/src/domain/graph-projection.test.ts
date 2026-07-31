import { describe, expect, it } from "vitest";
import { reachableNodeKeys } from "./graph-projection";
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

