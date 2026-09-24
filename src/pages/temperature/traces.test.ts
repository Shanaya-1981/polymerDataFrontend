import { describe, expect, it } from "vitest";
import { buildTemperatureLineTraces, type PlotlyData } from "@/components/charts";
import { parseImportCsv, type ImportedDataset } from "@/components/import";
import { getTemperatureSeries, NUMERIC_COLUMN_IDS, TEMPERATURES_C } from "@/data";
import { MAX_CATEGORICAL_SLOTS } from "@/styles/chart-palette";
import { transformTemperature, type TemperatureMode } from "@/lib/transforms";
import { DEFAULT_TEMPERATURE_COLOR_COLUMN, TEMPERATURE_COLOR_COLUMN_IDS } from "./state";
import {
  buildImportedLineSamples,
  buildLineSamples,
  CONDUCTIVITY_COLUMN_IDS,
  countSamplePoints,
  formatConductivity,
  importedTemperatureNotice,
  resolveClickedPoint,
  TEMPERATURE_Y_AXIS_TITLES,
  toYValue,
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

describe("CONDUCTIVITY_COLUMN_IDS", () => {
  it("finds a numeric column for every one of the 22 measurement temperatures", () => {
    expect(CONDUCTIVITY_COLUMN_IDS).toHaveLength(22);
    expect(CONDUCTIVITY_COLUMN_IDS).toHaveLength(TEMPERATURES_C.length);
    for (const id of CONDUCTIVITY_COLUMN_IDS) {
      expect(id).toBeDefined();
      expect(NUMERIC_COLUMN_IDS).toContain(id);
    }
    expect(CONDUCTIVITY_COLUMN_IDS[TEMPERATURES_C.indexOf(30)]).toBe("conductivityAt30C");
  });
});

function importCsv(lines: string[]): ImportedDataset {
  const result = parseImportCsv(lines.join("\n"), "mine.csv");
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

describe("buildImportedLineSamples", () => {
  const imported = importCsv([
    "Sample,Tg,Anion,Conductivity at 30C,Conductivity at 60C,Conductivity at 90C",
    "A,-40,TFSI,1e-5,1e-4,1e-3", // row 1: plots everywhere
    "B,,ClO4,2e-6,2e-5,", // row 2: no Tg — Arrhenius/T only
    "C,10,TFSI,,,", // row 3: no conductivity at all
    "D,-20,TFSI,0,5e-5,-1e-6", // row 4: two values a log axis can't show
    "E,80,ClO4,3e-6,4e-6,5e-6", // row 5: T = Tg - 50 at 30 °C
  ]);

  it("transforms each point exactly as the dataset's own series do", () => {
    const result = buildImportedLineSamples(imported, "Arrhenius", "anion");
    const [first] = result.samples;
    expect(first.rowNumber).toBe(1);
    expect(first.temperaturesC).toEqual([30, 60, 90]);
    expect(first.x).toEqual([30, 60, 90].map((t) => transformTemperature("Arrhenius", t, null)));
    expect(first.y).toEqual([1e-5, 1e-4, 1e-3]);
    expect(first.colorValue).toBe("TFSI");

    // Same x as a dataset point measured at the same temperature.
    const datasetPointAt30 = getTemperatureSeries("Arrhenius")
      .flatMap((series) => series.points)
      .find((point) => point.temperatureC === 30);
    expect(first.x[0]).toBe(datasetPointAt30?.x);
  });

  it("Arrhenius and T skip no row for lacking Tg, only rows with nothing to draw", () => {
    for (const mode of ["Arrhenius", "T"] as const) {
      const result = buildImportedLineSamples(imported, mode, "anion");
      expect(result.samples.map((s) => s.rowNumber)).toEqual([1, 2, 4, 5]);
      expect(result.missingTgCount).toBe(0);
      expect(result.noConductivityCount).toBe(1);
      expect(result.nonPositiveCount).toBe(2);
      expect(result.undefinedXCount).toBe(0);
    }
  });

  it("drops conductivity ≤ 0 point by point, keeping the rest of the row", () => {
    const result = buildImportedLineSamples(imported, "T", "anion");
    const rowD = result.samples.find((s) => s.rowNumber === 4);
    expect(rowD?.x).toEqual([60]);
    expect(rowD?.y).toEqual([5e-5]);
  });

  it("T/Tg uses the raw Tg and skips rows without one", () => {
    const result = buildImportedLineSamples(imported, "T/Tg", "anion");
    expect(result.samples.map((s) => s.rowNumber)).toEqual([1, 4, 5]);
    expect(result.samples[0].x).toEqual(
      [30, 60, 90].map((t) => transformTemperature("T/Tg", t, -40)),
    );
    expect(result.missingTgCount).toBe(1);
    expect(result.noConductivityCount).toBe(1);
  });

  it("VFT drops the point where T − Tg + 50 is 0", () => {
    const result = buildImportedLineSamples(imported, "VFT", "anion");
    const rowE = result.samples.find((s) => s.rowNumber === 5);
    expect(rowE?.temperaturesC).toEqual([60, 90]);
    expect(rowE?.x).toEqual([1000 / 30, 1000 / 60]);
    expect(result.undefinedXCount).toBe(1);
  });

  it("carries the current color column's value, or null if the file lacks it", () => {
    const byAnion = buildImportedLineSamples(imported, "Arrhenius", "anion");
    expect(byAnion.samples.map((s) => s.colorValue)).toEqual(["TFSI", "ClO4", "TFSI", "ClO4"]);
    const byFamily = buildImportedLineSamples(imported, "Arrhenius", "polymerFamily");
    expect(byFamily.samples.every((s) => s.colorValue === null)).toBe(true);
  });

  it("reports a file with no conductivity columns, and plots nothing", () => {
    const result = buildImportedLineSamples(
      importCsv(["Tg,Anion", "-40,TFSI"]),
      "Arrhenius",
      "anion",
    );
    expect(result.missingColumns).toEqual(["conductivity"]);
    expect(result.samples).toEqual([]);
  });

  it("reports a missing Tg column only in the modes that need it", () => {
    const noTg = importCsv(["approxTg,Conductivity at 30C", "-40,1e-5"]);
    expect(buildImportedLineSamples(noTg, "Arrhenius", "anion").missingColumns).toEqual([]);
    const vft = buildImportedLineSamples(noTg, "VFT", "anion");
    expect(vft.missingColumns).toEqual(["tg"]);
    expect(vft.hasApproxTg).toBe(true);
    expect(vft.samples).toEqual([]);
  });
});

describe("importedTemperatureNotice", () => {
  const imported = importCsv([
    "Tg,Anion,Conductivity at 30C,Conductivity at 60C",
    "-40,TFSI,1e-5,1e-4",
    ",ClO4,2e-6,2e-5",
    "10,TFSI,,",
    "-20,TFSI,0,5e-5",
    "80,ClO4,3e-6,4e-6",
  ]);

  it("is null when every imported row and point is plotted", () => {
    const clean = importCsv(["Tg,Conductivity at 30C", "-40,1e-5", "-20,2e-5"]);
    const result = buildImportedLineSamples(clean, "VFT", "anion");
    expect(importedTemperatureNotice(result, "VFT")).toBeNull();
  });

  it("explains hidden rows and points in Arrhenius", () => {
    const result = buildImportedLineSamples(imported, "Arrhenius", "anion");
    expect(importedTemperatureNotice(result, "Arrhenius")).toBe(
      "4 of 5 imported rows plotted: 1 has no conductivity value this plot can show. " +
        "1 imported conductivity value ≤ 0 hidden — the log axis can't show them.",
    );
  });

  it("adds the Tg and VFT-specific reasons in VFT", () => {
    const result = buildImportedLineSamples(imported, "VFT", "anion");
    expect(importedTemperatureNotice(result, "VFT")).toBe(
      "3 of 5 imported rows plotted: 1 has no Tg, which VFT needs; 1 has no conductivity value " +
        "this plot can show. 1 imported conductivity value ≤ 0 hidden — the log axis can't show " +
        "them. 1 imported point at T = Tg − 50 hidden — 1000/(T − Tg + 50) has no value there.",
    );
  });

  it("names the missing conductivity columns", () => {
    const result = buildImportedLineSamples(importCsv(["Tg", "-40"]), "T", "anion");
    expect(importedTemperatureNotice(result, "T")).toBe(
      'The imported file has no conductivity columns (such as "Conductivity at 30C"), so its ' +
        "rows can't be plotted against temperature.",
    );
  });

  it("names the missing Tg column, and points out approxTg isn't used here", () => {
    const withApprox = importCsv(["approxTg,Conductivity at 30C", "-40,1e-5"]);
    expect(
      importedTemperatureNotice(buildImportedLineSamples(withApprox, "T/Tg", "anion"), "T/Tg"),
    ).toBe(
      'T/Tg needs each sample\'s Tg, and the imported file has no "Tg" column. ' +
        "This view uses Tg, not approxTg.",
    );

    const without = importCsv(["Conductivity at 30C", "1e-5"]);
    expect(
      importedTemperatureNotice(buildImportedLineSamples(without, "VFT", "anion"), "VFT"),
    ).toBe('VFT needs each sample\'s Tg, and the imported file has no "Tg" column.');
  });
});

describe("the log σ y-axis", () => {
  it("titles each y-axis with its unit", () => {
    expect(TEMPERATURE_Y_AXIS_TITLES).toEqual({
      sigma: "Conductivity (S cm<sup>-1</sup>)",
      logSigma: "log(σ / S cm<sup>-1</sup>)",
    });
  });

  it("toYValue leaves σ alone on the log axis and takes log₁₀ for log σ", () => {
    expect(toYValue(3.98e-8, "sigma")).toBe(3.98e-8);
    expect(toYValue(1e-4, "logSigma")).toBe(-4);
    expect(toYValue(3.98e-8, "logSigma")).toBeCloseTo(-7.4001, 4);
  });

  it("maps every dataset point to log₁₀ σ without adding, dropping or moving any", () => {
    for (const mode of Object.keys(EXPECTED_POINTS) as TemperatureMode[]) {
      const sigma = buildLineSamples(mode, DEFAULT_TEMPERATURE_COLOR_COLUMN, {}, "sigma");
      const logSigma = buildLineSamples(mode, DEFAULT_TEMPERATURE_COLOR_COLUMN, {}, "logSigma");
      expect(countSamplePoints(logSigma)).toBe(EXPECTED_POINTS[mode]);
      expect(logSigma.map((s) => s.x)).toEqual(sigma.map((s) => s.x));
      expect(logSigma.map((s) => s.y)).toEqual(sigma.map((s) => s.y.map(Math.log10)));
    }
  });

  it("maps imported points the same way, still dropping σ ≤ 0 first", () => {
    const imported = importCsv([
      "Tg,Conductivity at 30C,Conductivity at 60C",
      "-40,1e-5,1e-4",
      "-20,0,5e-5",
    ]);
    const result = buildImportedLineSamples(imported, "Arrhenius", "anion", "logSigma");
    expect(result.samples.map((s) => s.y)).toEqual([[-5, -4], [Math.log10(5e-5)]]);
    expect(result.nonPositiveCount).toBe(1);
    expect(importedTemperatureNotice(result, "Arrhenius", "logSigma")).toBe(
      "1 imported conductivity value ≤ 0 hidden — log σ is undefined for them.",
    );
  });

  it("resolves a click on a log σ plot back to the raw conductivity", () => {
    const [sample] = buildLineSamples(
      "Arrhenius",
      DEFAULT_TEMPERATURE_COLOR_COLUMN,
      {},
      "logSigma",
    );
    const resolved = resolveClickedPoint(
      "Arrhenius",
      sample.rowIndex,
      sample.x[0],
      sample.y[0],
      "logSigma",
    );
    // The exact stored value — not 10 ** log σ, which drifts in the last digits.
    const [raw] = buildLineSamples("Arrhenius", DEFAULT_TEMPERATURE_COLOR_COLUMN, {}, "sigma");
    expect(resolved?.rowIndex).toBe(sample.rowIndex);
    expect(resolved?.conductivity).toBe(raw.y[0]);
  });
});
