import { describe, expect, it } from "vitest";
import { mergeSystemTags, systemTagPath } from "./structured-tags";

describe("structured tags", () => {
  it("builds searchable paths for list values", () => {
    expect(systemTagPath({ namespace: "field:species", value: "Вампир", label: "Вампир", color: "" })).toBe("вид/вампир");
    expect(systemTagPath({ namespace: "coterie-disposition", value: "enemy", label: "Враг", color: "#b23a48" })).toBe("отношение/враг");
  });

  it("replaces only namespaces controlled by the current form", () => {
    const result = mergeSystemTags(
      [
        { namespace: "field:species", value: "Человек", label: "Человек", color: "" },
        { namespace: "external", value: "keep", label: "", color: "" },
      ],
      new Set(["field:species"]),
      [{ namespace: "field:species", value: "Вампир", label: "Вампир", color: "" }],
    );
    expect(result.map((tag) => tag.value)).toEqual(["keep", "Вампир"]);
  });
});
