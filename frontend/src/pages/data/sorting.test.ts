import { describe, expect, it } from "vitest";
import { compareValues, sortRowIndices } from "./sorting";

describe("compareValues", () => {
  it("compares numbers numerically, ascending", () => {
    expect(compareValues(1, 2, "asc")).toBeLessThan(0);
    expect(compareValues(2, 1, "asc")).toBeGreaterThan(0);
    expect(compareValues(5, 5, "asc")).toBe(0);
  });

  it("reverses for descending", () => {
    expect(compareValues(1, 2, "desc")).toBeGreaterThan(0);
    expect(compareValues(2, 1, "desc")).toBeLessThan(0);
  });

  it("compares strings case-insensitively", () => {
    expect(compareValues("banana", "Apple", "asc")).toBeGreaterThan(0);
  });

  it("compares strings numeric-aware, so Comonomer2 sorts before Comonomer10", () => {
    expect(compareValues("Comonomer2", "Comonomer10", "asc")).toBeLessThan(0);
  });

  it("a null value always sorts after a non-null value, ascending", () => {
    expect(compareValues(null, 5, "asc")).toBeGreaterThan(0);
    expect(compareValues(5, null, "asc")).toBeLessThan(0);
  });

  it("a null value STILL sorts after a non-null value when descending", () => {
    // The regression this guards against: naively negating the ascending
    // result would put nulls first on a descending sort. A missing value is
    // not "smaller than everything", in either direction.
    expect(compareValues(null, 5, "desc")).toBeGreaterThan(0);
    expect(compareValues(5, null, "desc")).toBeLessThan(0);
  });

  it("two nulls are equal, in either direction", () => {
    expect(compareValues(null, null, "asc")).toBe(0);
    expect(compareValues(null, null, "desc")).toBe(0);
  });
});

describe("sortRowIndices", () => {
  const values: Record<number, number | null> = { 0: 3, 1: null, 2: 1, 3: null, 4: 2 };
  const getValue = (i: number) => values[i];

  it("sorts ascending with nulls last", () => {
    expect(sortRowIndices([0, 1, 2, 3, 4], getValue, "asc")).toEqual([2, 4, 0, 1, 3]);
  });

  it("sorts descending with nulls STILL last, not first", () => {
    expect(sortRowIndices([0, 1, 2, 3, 4], getValue, "desc")).toEqual([0, 4, 2, 1, 3]);
  });

  it("is stable: rows tied on the sort column keep their relative order", () => {
    const tied: Record<number, number | null> = { 0: 1, 1: 1, 2: 1 };
    expect(sortRowIndices([0, 1, 2], (i) => tied[i], "asc")).toEqual([0, 1, 2]);
  });

  it("does not mutate the input array", () => {
    const input = [0, 1, 2, 3, 4];
    sortRowIndices(input, getValue, "asc");
    expect(input).toEqual([0, 1, 2, 3, 4]);
  });

  it("sorts text columns too, nulls last", () => {
    const words: Record<number, string | null> = { 0: "banana", 1: "apple", 2: null };
    expect(sortRowIndices([0, 1, 2], (i) => words[i], "asc")).toEqual([1, 0, 2]);
  });
});
