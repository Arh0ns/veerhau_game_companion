import { describe, expect, it } from "vitest";
import { MentionIndex, SearchIndex } from "./knowledge-search";
import type { ChronicleRecord } from "./types";

const record = (id: string, fields: Record<string, unknown>): ChronicleRecord => ({ id, createdAt: "", updatedAt: id, ...fields });
const records = [
  { entity: "facts" as const, record: record("1", { statement: "Князь покинул Прагу", tags: ["город/прага", "политика", "city/prague"], status: "Подтверждено" }), title: "Исчезновение князя", typeLabel: "Факт" },
  { entity: "characters" as const, record: record("2", { name: "Маркус", aliases: ["Князь"], description: "Маркус скрывает планы" }), title: "Маркус", typeLabel: "Персонаж" },
];

describe("SearchIndex", () => {
  const index = new SearchIndex(records, [], (_, id) => id);

  it("supports nested tags and OR", () => {
    expect(index.search("тег:город OR Маркус")).toHaveLength(2);
    expect(index.search("tag:#city")).toHaveLength(1);
  });

  it("supports negation and properties", () => {
    expect(index.search("Прагу -[status:ложь]")[0]?.record.id).toBe("1");
  });
});

describe("MentionIndex", () => {
  it("finds an exact unlinked alias mention", () => {
    const index = new SearchIndex(records, [], (_, id) => id);
    expect(new MentionIndex(index.all(), []).mentionsFor(index.all()[1]!)[0]?.document.record.id).toBe("1");
  });

  it("builds one review suggestion per unlinked pair", () => {
    const index = new SearchIndex(records, [], (_, id) => id);
    const suggestions = new MentionIndex(index.all(), []).allSuggestions();
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.pairKey).toBe("characters:2|facts:1");
  });
});
