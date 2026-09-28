import { describe, expect, it } from "vitest";
import { categoryOrder, rankOf } from "./categories";

describe("category accessors", () => {
  it("returns the frozen frequency order for Anion (DATA-SPEC.md §7)", () => {
    expect(categoryOrder("anion")).toEqual([
      "TFSI",
      "CF3SO3",
      "ClO4",
      "BF4",
      "PF6",
      "AsF6",
      "AlCl4",
      "MPSA",
      "N(SO2C2F5)2",
      "I",
      "SCN",
      "FSI",
    ]);
  });

  it("rankOf gives the 0-based position used by slotForRank", () => {
    expect(rankOf("anion", "TFSI")).toBe(0);
    expect(rankOf("anion", "CF3SO3")).toBe(1);
  });

  it("rankOf returns -1 for a value outside the order (folds to Other)", () => {
    expect(rankOf("anion", "not-a-real-anion")).toBe(-1);
  });
});
