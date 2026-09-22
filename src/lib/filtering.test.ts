import { describe, expect, it } from "vitest";
import { filterRowIndices, matchesFilters, type FilterSelections } from "./filtering";

describe("matchesFilters", () => {
  it("with no active filters, every row matches", () => {
    expect(matchesFilters({ Anion: "TFSI" }, {})).toBe(true);
    expect(matchesFilters({ Anion: "TFSI" }, { Anion: [] })).toBe(true);
  });

  it("ORs within a single column", () => {
    const filters: FilterSelections = { Anion: ["TFSI", "ClO4"] };
    expect(matchesFilters({ Anion: "TFSI" }, filters)).toBe(true);
    expect(matchesFilters({ Anion: "ClO4" }, filters)).toBe(true);
    expect(matchesFilters({ Anion: "BF4" }, filters)).toBe(false);
  });

  it("ANDs across columns", () => {
    const filters: FilterSelections = {
      Anion: ["TFSI", "ClO4"],
      "Solvent used": ["water"],
    };
    expect(matchesFilters({ Anion: "TFSI", "Solvent used": "water" }, filters)).toBe(true);
    expect(matchesFilters({ Anion: "TFSI", "Solvent used": "DMF" }, filters)).toBe(false);
    expect(matchesFilters({ Anion: "BF4", "Solvent used": "water" }, filters)).toBe(false);
  });

  it("a null/missing value never matches an active filter", () => {
    expect(matchesFilters({ Anion: null }, { Anion: ["TFSI"] })).toBe(false);
  });
});

describe("filterRowIndices", () => {
  const columns = {
    Anion: ["TFSI", "ClO4", "TFSI", "BF4"],
    "Solvent used": ["water", "water", "DMF", "water"],
  };

  it("returns every index when no filters are active", () => {
    expect(filterRowIndices(4, columns, {})).toEqual([0, 1, 2, 3]);
  });

  it("combines multi-select filters: AND across columns, OR within a column", () => {
    const filters: FilterSelections = {
      Anion: ["TFSI", "BF4"],
      "Solvent used": ["water"],
    };
    // row0: TFSI+water (match), row1: ClO4+water (Anion fails),
    // row2: TFSI+DMF (Solvent fails), row3: BF4+water (match)
    expect(filterRowIndices(4, columns, filters)).toEqual([0, 3]);
  });

  it("a column with an empty selection imposes no constraint", () => {
    const filters: FilterSelections = { Anion: [], "Solvent used": ["DMF"] };
    expect(filterRowIndices(4, columns, filters)).toEqual([2]);
  });
});
