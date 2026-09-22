import { describe, expect, it } from "vitest";
import { TEMPERATURE_MODES } from "@/lib/transforms";
import {
  isTemperatureColorColumn,
  isTemperatureMode,
  TEMPERATURE_COLOR_COLUMN_IDS,
  TEMPERATURE_FILTER_COLUMN_IDS,
} from "./state";

describe("isTemperatureMode", () => {
  it("accepts every real mode", () => {
    for (const mode of TEMPERATURE_MODES) expect(isTemperatureMode(mode)).toBe(true);
  });

  it("rejects a hand-edited URL value, so callers fall back to the default instead of trusting it", () => {
    expect(isTemperatureMode("bogus")).toBe(false);
    expect(isTemperatureMode("")).toBe(false);
  });
});

describe("isTemperatureColorColumn", () => {
  it("accepts the 4 color-eligible categorical columns", () => {
    for (const id of TEMPERATURE_COLOR_COLUMN_IDS) expect(isTemperatureColorColumn(id)).toBe(true);
  });

  it("rejects DOI/Polymer (filter-only, per CHART-PALETTE.md's too-many-categories rule) and garbage", () => {
    expect(isTemperatureColorColumn("doi")).toBe(false);
    expect(isTemperatureColorColumn("polymer")).toBe(false);
    expect(isTemperatureColorColumn("bogus")).toBe(false);
  });
});

describe("TEMPERATURE_FILTER_COLUMN_IDS", () => {
  it("is DOI plus the 4 color-eligible columns, per the page brief's 'combinable filters' list", () => {
    expect([...TEMPERATURE_FILTER_COLUMN_IDS].sort()).toEqual(
      ["doi", "polymerFamily", "anion", "crystalline", "solventUsed"].sort(),
    );
  });
});
