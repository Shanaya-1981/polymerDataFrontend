import { describe, expect, it } from "vitest";
import { categoryRank, rankCategories } from "./category-order";

describe("rankCategories", () => {
  it("orders by descending frequency", () => {
    const values = ["a", "b", "b", "c", "c", "c"];
    expect(rankCategories(values)).toEqual(["c", "b", "a"]);
  });

  it("breaks ties by first appearance, not alphabetically", () => {
    // "z" and "a" are tied at 2 occurrences each; "z" appears first.
    const values = ["z", "a", "z", "a"];
    expect(rankCategories(values)).toEqual(["z", "a"]);
  });

  it("reproduces the live Anion frequency order verified in DATA-SPEC.md §7", () => {
    // Counts from the real column: TFSI 282, CF3SO3 164, ClO4 120, BF4 33, …
    // DATA-SPEC.md states the frequency order begins "TFSI, CF3SO3, ClO4, BF4, …",
    // distinct from the original's first-appearance order
    // "TFSI, N(SO2C2F5)2, BF4, ClO4, CF3SO3, …".
    const values = [
      ...Array(282).fill("TFSI"),
      ...Array(164).fill("CF3SO3"),
      ...Array(120).fill("ClO4"),
      ...Array(33).fill("BF4"),
    ];
    // Interleave so first-appearance order would differ from frequency order
    // if the tie-break (rather than frequency) were driving the sort.
    const shuffled = ["N(SO2C2F5)2", ...values, "N(SO2C2F5)2"];
    expect(rankCategories(shuffled).slice(0, 4)).toEqual(["TFSI", "CF3SO3", "ClO4", "BF4"]);
  });

  it("never repaints: the order does not depend on a filtered subset", () => {
    const full = ["a", "a", "a", "b", "b", "c"];
    const filteredView = full.filter((v) => v !== "c"); // "c" dropped by a filter
    // The whole point of freezing at build time is that we rank once over
    // `full`, not per-view — this test documents that ranking a subset would
    // give a different (wrong) answer, which is exactly what must not happen.
    expect(rankCategories(full)).toEqual(["a", "b", "c"]);
    expect(rankCategories(filteredView)).toEqual(["a", "b"]);
  });
});

describe("categoryRank", () => {
  it("returns the 0-based index into the frozen order", () => {
    const order = ["TFSI", "CF3SO3", "ClO4"];
    expect(categoryRank(order, "TFSI")).toBe(0);
    expect(categoryRank(order, "ClO4")).toBe(2);
  });

  it("returns -1 for a value outside the known order", () => {
    expect(categoryRank(["TFSI"], "unknown-anion")).toBe(-1);
  });
});
