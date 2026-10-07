import { describe, expect, it } from "vitest";
import { COLUMNS } from "@/data";
import {
  ALL_COLUMN_OPTIONS,
  columnHeading,
  columnLabel,
  DEFAULT_COLUMN_IDS,
  isColumnId,
  resolveColumnIds,
  shortenDoi,
} from "./columns";

describe("isColumnId", () => {
  it("accepts every id in the generated registry", () => {
    for (const column of COLUMNS) {
      expect(isColumnId(column.id)).toBe(true);
    }
  });

  it("rejects an unknown id", () => {
    expect(isColumnId("not-a-real-column")).toBe(false);
    expect(isColumnId("")).toBe(false);
  });
});

describe("columnLabel / columnHeading", () => {
  it("returns the plain label with no unit", () => {
    expect(columnLabel("approxTg")).toBe("approxTg");
    expect(columnLabel("anion")).toBe("Anion");
  });

  it("appends the unit, parenthesized, when the column has one", () => {
    expect(columnHeading("approxTg")).toBe("approxTg (°C)");
  });

  it("omits the parens entirely when the column has no unit", () => {
    expect(columnHeading("anion")).toBe("Anion");
  });

  it("does not double the unit when the label already ends in '(unit)' — a real bug caught by rendering the page in a browser, not by typecheck/lint/tests", () => {
    expect(columnHeading("approxMWKDa")).toBe("approxMW(kDa)");
    expect(columnHeading("arrheniusEaEV")).toBe("Arrhenius Ea (eV)");
    expect(columnHeading("polymerMnKDa")).toBe("Polymer Mn (kDa)");
    expect(columnHeading("dryingTimeH")).toBe("drying time (h)");
  });

  it("falls back to the raw id for an unrecognized column", () => {
    expect(columnLabel("nope")).toBe("nope");
    expect(columnHeading("nope")).toBe("nope");
  });
});

describe("DEFAULT_COLUMN_IDS", () => {
  it("names only real columns", () => {
    for (const id of DEFAULT_COLUMN_IDS) {
      expect(isColumnId(id)).toBe(true);
    }
  });

  it("has no duplicates", () => {
    expect(new Set(DEFAULT_COLUMN_IDS).size).toBe(DEFAULT_COLUMN_IDS.length);
  });
});

describe("ALL_COLUMN_OPTIONS", () => {
  it("offers exactly the generated registry's columns, in its own order", () => {
    expect(ALL_COLUMN_OPTIONS.map((o) => o.value)).toEqual(COLUMNS.map((c) => c.id));
  });
});

describe("resolveColumnIds", () => {
  it("passes through known ids and preserves order", () => {
    expect(resolveColumnIds(["anion", "polymer"])).toEqual(["anion", "polymer"]);
  });

  it("drops unknown ids", () => {
    expect(resolveColumnIds(["anion", "not-real", "polymer"])).toEqual(["anion", "polymer"]);
  });

  it("drops duplicates, keeping the first occurrence", () => {
    expect(resolveColumnIds(["anion", "polymer", "anion"])).toEqual(["anion", "polymer"]);
  });

  it("returns an empty array for an all-invalid or empty input", () => {
    // The empty-string entry is how `useUrlState` represents an explicit
    // "chose zero columns" (see its own doc comment on explicit-empty
    // arrays) rather than "the param was never set".
    expect(resolveColumnIds([""])).toEqual([]);
    expect(resolveColumnIds([])).toEqual([]);
  });
});

describe("shortenDoi", () => {
  it("strips the https://doi.org/ prefix", () => {
    expect(shortenDoi("https://doi.org/10.1016/j.ssi.2016.02.020")).toBe(
      "10.1016/j.ssi.2016.02.020",
    );
  });

  it("strips a dx.doi.org prefix too", () => {
    expect(shortenDoi("http://dx.doi.org/10.1021/ma00207a006")).toBe("10.1021/ma00207a006");
  });

  it("leaves an already-bare DOI untouched", () => {
    expect(shortenDoi("10.1038/pj.2012.97")).toBe("10.1038/pj.2012.97");
  });
});
