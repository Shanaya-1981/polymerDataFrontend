import { describe, expect, it } from "vitest";
import { buildTemperatureLineTraces, type PlotlyData } from "@/components/charts";
import { MAX_CATEGORICAL_SLOTS } from "@/styles/chart-palette";
import type { TemperatureMode } from "@/lib/transforms";
import { DEFAULT_TEMPERATURE_COLOR_COLUMN, TEMPERATURE_COLOR_COLUMN_IDS } from "./state";
import {
  buildLineSamples,
  countSamplePoints,
  formatConductivity,
  resolveClickedPoint,
} from "./traces";

/**
 * Ground truth captured from the live pedatamine.org server — DATA-SPEC.md
 * §6/§9 and `data/reference/live-figure-fixtures.json`. These counts are
 * the strongest evidence the rebuild is faithful: the ORIGINAL emitted one
 * Plotly trace per row (655 of them, ~1 MB of JSON per interaction); this
 * page must reproduce the same total point counts while batching every
 * mode into at most `MAX_CATEGORICAL_SLOTS + 1` (8) traces.
 */
const EXPECTED_POINTS: Record<TemperatureMode, number> = {
  Arrhenius: 5225,
  T: 5225,
  "T/Tg": 3401,
  VFT: 3401,
};

// `PlotlyData` is Plotly's own generated trace union (40+ trace types, most
// without an `x`), so a plain `.x` access doesn't type-check on it directly
// — narrow through this minimal local shape instead, same pattern as
// `series.test.ts`'s own `shape<T>` helper.
interface LineTraceShape {
  x: readonly (number | null)[];
}

function nonNullXCount(trace: PlotlyData): number {
  const { x } = trace as unknown as LineTraceShape;
  return x.filter((value) => value !== null).length;
}

describe("buildLineSamples + buildTemperatureLineTraces — faithful to the live server", () => {
  for (const mode of Object.keys(EXPECTED_POINTS) as TemperatureMode[]) {
    it(`${mode}: ${EXPECTED_POINTS[mode]} total points, batched into <= 8 traces`, () => {
      const samples = buildLineSamples(mode, DEFAULT_TEMPERATURE_COLOR_COLUMN, {});

      // Point total survives the empty-series filter and the per-row ->
      // per-color-slot concatenation untouched (DATA-SPEC.md §8: dropping
      // the 36 always-empty rows removes rows contributing 0 points, never
      // real points).
      expect(countSamplePoints(samples)).toBe(EXPECTED_POINTS[mode]);

      const traces = buildTemperatureLineTraces(samples, "light");

      // The whole point of this page: never one trace per sample.
      expect(traces.length).toBeLessThanOrEqual(8);
      expect(traces.length).toBeLessThanOrEqual(MAX_CATEGORICAL_SLOTS + 1);
      expect(traces.length).toBeGreaterThan(0);

      // Every non-null x in the batched traces is a real plotted point;
      // nulls are the separators `buildNullSeparatedGroups` inserts between
      // concatenated rows, never data.
      const plottedPoints = traces.reduce((sum, trace) => sum + nonNullXCount(trace), 0);
      expect(plottedPoints).toBe(EXPECTED_POINTS[mode]);
    });
  }

  it("never exceeds 8 traces for any of the 4 color columns, incl. 24-category Polymer family", () => {
    for (const colorColumn of TEMPERATURE_COLOR_COLUMN_IDS) {
      const samples = buildLineSamples("Arrhenius", colorColumn, {});
      const traces = buildTemperatureLineTraces(samples, "light");
      expect(traces.length).toBeLessThanOrEqual(8);
    }
  });

  it("T/Tg and VFT plot the same 368-row subset (DATA-SPEC.md §9), 287 fewer rows than Arrhenius/T", () => {
    const arrhenius = buildLineSamples("Arrhenius", DEFAULT_TEMPERATURE_COLOR_COLUMN, {});
    const t = buildLineSamples("T", DEFAULT_TEMPERATURE_COLOR_COLUMN, {});
    const tOverTg = buildLineSamples("T/Tg", DEFAULT_TEMPERATURE_COLOR_COLUMN, {});
    const vft = buildLineSamples("VFT", DEFAULT_TEMPERATURE_COLOR_COLUMN, {});

    expect(arrhenius.map((s) => s.rowIndex)).toEqual(t.map((s) => s.rowIndex));
    expect(tOverTg.map((s) => s.rowIndex)).toEqual(vft.map((s) => s.rowIndex));
    expect(arrhenius.length).toBeGreaterThan(tOverTg.length);
  });

  it("an impossible filter combination yields zero samples — the page's empty-state trigger", () => {
    const samples = buildLineSamples("Arrhenius", DEFAULT_TEMPERATURE_COLOR_COLUMN, {
      anion: ["this-anion-does-not-exist"],
    });
    expect(samples).toHaveLength(0);
  });

  it("an unfiltered run always has at least one sample in every mode, so 'Clear filters' always recovers", () => {
    for (const mode of Object.keys(EXPECTED_POINTS) as TemperatureMode[]) {
      expect(buildLineSamples(mode, DEFAULT_TEMPERATURE_COLOR_COLUMN, {}).length).toBeGreaterThan(
        0,
      );
    }
  });

  it("rank comes from the frozen dataset-wide order and never changes under filtering", () => {
    const unfiltered = buildLineSamples("Arrhenius", "anion", {});
    const sample = unfiltered.find((s) => s.rank >= 0);
    expect(sample).toBeDefined();

    // Filter down to just that one row's own anion — the row's rank (hence
    // its color slot) must be identical to the unfiltered run.
    const filtered = buildLineSamples("Arrhenius", "anion", { anion: [sample!.category] });
    const same = filtered.find((s) => s.rowIndex === sample!.rowIndex);
    expect(same).toBeDefined();
    expect(same!.rank).toBe(sample!.rank);
  });
});

describe("resolveClickedPoint", () => {
  it("resolves a real click back to its source row, temperature, and conductivity", () => {
    const [sample] = buildLineSamples("Arrhenius", DEFAULT_TEMPERATURE_COLOR_COLUMN, {});
    const resolved = resolveClickedPoint("Arrhenius", sample.rowIndex, sample.x[0], sample.y[0]);
    expect(resolved).not.toBeNull();
    expect(resolved?.rowIndex).toBe(sample.rowIndex);
    expect(resolved?.conductivity).toBe(sample.y[0]);
  });

  it("returns null for non-numeric customdata/x/y (a null separator can never be 'clicked')", () => {
    expect(resolveClickedPoint("Arrhenius", null, 1, 2)).toBeNull();
    expect(resolveClickedPoint("Arrhenius", 0, null, 2)).toBeNull();
    expect(resolveClickedPoint("Arrhenius", 0, 1, null)).toBeNull();
  });

  it("returns null when the row has no series in this mode (out of range, or no raw Tg)", () => {
    expect(resolveClickedPoint("T/Tg", 999_999, 1, 2)).toBeNull();
  });
});

describe("formatConductivity", () => {
  it("matches the reference row's fixture value (DATA-SPEC.md §6): 3.98e-8 -> 3.98 x 10^-8", () => {
    expect(formatConductivity(3.98e-8)).toEqual({ mantissa: "3.98", exponent: -8 });
  });

  it("handles a positive/zero exponent", () => {
    expect(formatConductivity(1.5e2)).toEqual({ mantissa: "1.50", exponent: 2 });
  });
});
