import { describe, expect, it } from "vitest";
import { getRows } from "@/data";
import { matchesSearch, SEARCHABLE_COLUMN_IDS } from "./search";

// Same fixture row `@/data/dataset.test.ts` anchors on: ground truth from
// the real dataset rather than a synthetic row, per this codebase's house
// style for data-shaped tests.
const rows = getRows();
const fixture = rows.find(
  (r) => r.polymer === "polyethylene carbonate" && r.anion === "TFSI" && r.tg === -3,
)!;

describe("SEARCHABLE_COLUMN_IDS", () => {
  it("is exactly the ten text (categorical) columns", () => {
    expect(SEARCHABLE_COLUMN_IDS).toEqual([
      "polymerFamily",
      "polymer",
      "anion",
      "crystalline",
      "solventUsed",
      "doi",
      "reference",
      "notes",
      "smilesDescriptor1",
      "smilesDescriptor2",
    ]);
  });
});

describe("matchesSearch", () => {
  it("matches an empty (or all-whitespace) query against every row", () => {
    expect(matchesSearch(fixture, "")).toBe(true);
    expect(matchesSearch(fixture, "   ")).toBe(true);
  });

  it("matches the polymer name, case-insensitively", () => {
    expect(matchesSearch(fixture, "POLYETHYLENE CARBONATE")).toBe(true);
  });

  it("matches a substring, not just a whole-field match", () => {
    expect(matchesSearch(fixture, "carbonate")).toBe(true);
  });

  it("matches inside the DOI", () => {
    expect(matchesSearch(fixture, "10.1038/pj.2012.97")).toBe(true);
  });

  it("matches the anion", () => {
    expect(matchesSearch(fixture, "tfsi")).toBe(true);
  });

  it("matches inside the free-form Reference citation text", () => {
    expect(matchesSearch(fixture, "Tominaga")).toBe(true);
  });

  it("does not match unrelated text", () => {
    expect(matchesSearch(fixture, "xyz-not-in-this-row-anywhere")).toBe(false);
  });

  it("does not match a numeric column's value (Tg = -3 for this row)", () => {
    // Guards against ever widening the search to numeric columns by
    // accident — none of this row's ten text columns happens to contain the
    // substring "-3" either, so this only passes if search stays scoped to
    // SEARCHABLE_COLUMN_IDS.
    expect(matchesSearch(fixture, "-3")).toBe(false);
  });
});
