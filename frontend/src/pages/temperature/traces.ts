/**
 * Pure data pipeline for the Temperature page's plot and inspector: composes
 * the shared data layer (`getTemperatureSeries`, `categoricalColumn`,
 * `rankOf`, `filterRows`) into the `LineSample[]` shape
 * `buildTemperatureLineTraces` (chart layer) expects, plus click ->
 * (row, temperature, conductivity) resolution.
 *
 * Deliberately free of React/Plotly-runtime imports (only Plotly *types*)
 * so it's trivially unit-testable — jsdom has no WebGL/canvas, so these are
 * the trace-building INPUTS Plotly ends up rendering, not the rendered
 * chart. See `traces.test.ts`.
 */
import type { ImportedLineSample, LineSample, PlotlyDatum } from "@/components/charts";
import type { ImportedDataset } from "@/components/import";
import {
  categoricalColumn,
  COLUMNS,
  filterRows,
  getRow,
  getTemperatureSeries,
  rankOf,
  TEMPERATURES_C,
  type NumericColumnId,
} from "@/data";
import type { FilterSelections } from "@/lib/filtering";
import { buildTemperatureSeries, modeRequiresTg, type TemperatureMode } from "@/lib/transforms";
import {
  DEFAULT_TEMPERATURE_Y_AXIS,
  type TemperatureColorColumn,
  type TemperatureYAxis,
} from "./state";

/** DATA-SPEC.md: "no categorical column has blanks" — this should be dead
 *  code in practice, but `categoricalColumn` is typed `string | null`, so a
 *  total fallback keeps `buildLineSamples` from needing to throw on it. */
const UNKNOWN_CATEGORY_LABEL = "Unknown";

export const CONDUCTIVITY_Y_AXIS_TITLE = "Conductivity (S cm<sup>-1</sup>)";

export const TEMPERATURE_Y_AXIS_TITLES: Readonly<Record<TemperatureYAxis, string>> = {
  sigma: CONDUCTIVITY_Y_AXIS_TITLE,
  logSigma: "log(σ / S cm<sup>-1</sup>)",
};

/** A conductivity (S/cm) as the chosen y-axis plots it. Only ever called
 *  with σ > 0: the dataset has no other values (verified) and
 *  `buildImportedLineSamples` drops them from user files first. */
export function toYValue(conductivity: number, yAxis: TemperatureYAxis): number {
  return yAxis === "logSigma" ? Math.log10(conductivity) : conductivity;
}

/**
 * How many of the dataset's 655 rows have a raw `Tg` — the fixed size of
 * the `T/Tg`/`VFT` series set (368, DATA-SPEC.md §9), independent of any
 * active filter. Computed once at module load (`getTemperatureSeries` is
 * itself memoized per mode) for the "fewer samples in this view" notice.
 */
export const TG_ELIGIBLE_ROW_COUNT = getTemperatureSeries("T/Tg").length;

/**
 * One `LineSample` per row that (a) survives the active filters and (b) has
 * at least one plottable point in this mode — DATA-SPEC.md §8: "an empty
 * series is not a line," so the 36 always-empty rows (and, in `T/Tg`/`VFT`,
 * any of the 368 Tg-bearing rows that still have zero conductivity) are
 * skipped here rather than passed through as zero-length lines.
 *
 * Color rank always comes from `rankOf`, the frozen dataset-wide order
 * (DATA-SPEC.md §7) — never recomputed from this filtered subset — so a
 * category's color never shifts as filters change.
 */
export function buildLineSamples(
  mode: TemperatureMode,
  colorColumn: TemperatureColorColumn,
  filters: FilterSelections,
  yAxis: TemperatureYAxis = DEFAULT_TEMPERATURE_Y_AXIS,
): LineSample[] {
  const keptRows = new Set(filterRows(filters));
  const colorValues = categoricalColumn(colorColumn);

  const samples: LineSample[] = [];
  for (const series of getTemperatureSeries(mode)) {
    if (series.points.length === 0) continue;
    if (!keptRows.has(series.rowIndex)) continue;

    const category = colorValues[series.rowIndex];
    const rank = category == null ? -1 : rankOf(colorColumn, category);

    samples.push({
      x: series.points.map((point) => point.x),
      y: series.points.map((point) => toYValue(point.y, yAxis)),
      rank,
      category: category ?? UNKNOWN_CATEGORY_LABEL,
      rowIndex: series.rowIndex,
    });
  }
  return samples;
}

/** Total plotted points across a set of samples. Compare against
 *  `@/lib/transforms`'s `countPoints(getTemperatureSeries(mode))`: the two
 *  agree exactly, because the empty-series rows this function filters out
 *  contribute 0 points either way. */
export function countSamplePoints(samples: readonly LineSample[]): number {
  return samples.reduce((sum, sample) => sum + sample.x.length, 0);
}

// ---------------------------------------------------------------------------
// User-imported rows (`@/components/import`) — same transforms as the
// dataset, but never filtered
// ---------------------------------------------------------------------------

/**
 * The registry column behind each of the 22 measurement temperatures, in
 * `TEMPERATURES_C` order, looked up by the source header the build script
 * reads (`Conductivity at ${t}C`). `traces.test.ts` asserts none is missing.
 */
export const CONDUCTIVITY_COLUMN_IDS: readonly (NumericColumnId | undefined)[] = TEMPERATURES_C.map(
  (t) =>
    COLUMNS.find((column) => column.label === `Conductivity at ${t}C`)?.id as
      NumericColumnId | undefined,
);

export interface ImportedTemperatureResult {
  readonly samples: readonly ImportedLineSample[];
  readonly totalCount: number;
  /** Rows with no Tg, in a mode that needs one. */
  readonly missingTgCount: number;
  /** Rows left with no point to draw. */
  readonly noConductivityCount: number;
  /** Conductivity values ≤ 0, dropped because the y-axis is always log. */
  readonly nonPositiveCount: number;
  /** VFT points at T = Tg − 50, where 1000/(T − Tg + 50) has no value. */
  readonly undefinedXCount: number;
  /** Columns this mode needs that the file doesn't have at all. */
  readonly missingColumns: readonly ("conductivity" | "tg")[];
  /** Whether the file has `approxTg` — the column people reach for when
   *  `Tg` is missing, which this page deliberately doesn't use. */
  readonly hasApproxTg: boolean;
}

/**
 * Imported rows as overlay curves for the current view. The dataset
 * filters deliberately don't apply — they narrow the literature, and the
 * user's own rows stay visible against whatever slice they pick. x comes
 * from the same `buildTemperatureSeries` as the dataset — raw `Tg` only,
 * never `approxTg`, exactly as DATA-SPEC.md §1 requires.
 *
 * Two guards the dataset never needs (verified: it has no conductivity
 * ≤ 0 and no VFT denominator of 0) but a user's file might: non-positive
 * conductivity is dropped, and so is a non-finite x. Both are counted so
 * the page can say what it hid.
 */
export function buildImportedLineSamples(
  imported: ImportedDataset,
  mode: TemperatureMode,
  colorColumn: TemperatureColorColumn,
  yAxis: TemperatureYAxis = DEFAULT_TEMPERATURE_Y_AXIS,
): ImportedTemperatureResult {
  const conductivityColumns = CONDUCTIVITY_COLUMN_IDS.map((id) =>
    id ? imported.numeric[id] : undefined,
  );
  const tgColumn = imported.numeric.tg;

  const missingColumns: ("conductivity" | "tg")[] = [];
  if (conductivityColumns.every((column) => !column)) missingColumns.push("conductivity");
  if (modeRequiresTg(mode) && !tgColumn) missingColumns.push("tg");

  const result = {
    samples: [] as ImportedLineSample[],
    totalCount: imported.rowCount,
    missingTgCount: 0,
    noConductivityCount: 0,
    nonPositiveCount: 0,
    undefinedXCount: 0,
    missingColumns,
    hasApproxTg: imported.numeric.approxTg != null,
  };
  if (missingColumns.length > 0) return result;

  const rows = Array.from({ length: imported.rowCount }, (_, row) => row);
  const matrix = rows.map((row) => conductivityColumns.map((column) => column?.[row] ?? null));
  const tg = rows.map((row) => tgColumn?.[row] ?? null);
  const seriesByRow = new Map(
    buildTemperatureSeries(mode, TEMPERATURES_C, matrix, tg).map((s) => [s.rowIndex, s]),
  );
  const colorValues = imported.categorical[colorColumn];

  for (const row of rows) {
    const series = seriesByRow.get(row);
    if (!series) {
      // Only T/Tg and VFT skip a row outright: it has no Tg.
      result.missingTgCount += 1;
      continue;
    }
    const kept = series.points.filter((point) => {
      if (point.y <= 0) {
        result.nonPositiveCount += 1;
        return false;
      }
      if (!Number.isFinite(point.x)) {
        result.undefinedXCount += 1;
        return false;
      }
      return true;
    });
    if (kept.length === 0) {
      result.noConductivityCount += 1;
      continue;
    }
    result.samples.push({
      x: kept.map((point) => point.x),
      y: kept.map((point) => toYValue(point.y, yAxis)),
      temperaturesC: kept.map((point) => point.temperatureC),
      rowNumber: row + 1,
      colorValue: colorValues?.[row] ?? null,
    });
  }

  return result;
}

/**
 * Why some or all imported rows or points aren't on the chart, or `null`
 * when everything is — the Temperature twin of Explore's
 * `importedNoticeMessage`.
 */
export function importedTemperatureNotice(
  result: ImportedTemperatureResult,
  mode: TemperatureMode,
  yAxis: TemperatureYAxis = DEFAULT_TEMPERATURE_Y_AXIS,
): string | null {
  if (result.missingColumns.includes("conductivity")) {
    return (
      'The imported file has no conductivity columns (such as "Conductivity at 30C"), so its rows ' +
      "can't be plotted against temperature."
    );
  }
  if (result.missingColumns.includes("tg")) {
    const hint = result.hasApproxTg ? " This view uses Tg, not approxTg." : "";
    return `${mode} needs each sample's Tg, and the imported file has no "Tg" column.${hint}`;
  }

  const sentences: string[] = [];
  const plotted = result.samples.length;
  if (plotted < result.totalCount) {
    const reasons: string[] = [];
    if (result.missingTgCount > 0) {
      const n = result.missingTgCount;
      reasons.push(`${n} ${n === 1 ? "has" : "have"} no Tg, which ${mode} needs`);
    }
    if (result.noConductivityCount > 0) {
      const n = result.noConductivityCount;
      reasons.push(`${n} ${n === 1 ? "has" : "have"} no conductivity value this plot can show`);
    }
    sentences.push(
      `${plotted} of ${result.totalCount} imported rows plotted: ${reasons.join("; ")}.`,
    );
  }
  if (result.nonPositiveCount > 0) {
    const n = result.nonPositiveCount;
    const why =
      yAxis === "logSigma" ? "log σ is undefined for them" : "the log axis can't show them";
    sentences.push(
      `${n} imported conductivity ${n === 1 ? "value" : "values"} ≤ 0 hidden — ${why}.`,
    );
  }
  if (result.undefinedXCount > 0) {
    const n = result.undefinedXCount;
    sentences.push(
      `${n} imported ${n === 1 ? "point" : "points"} at T = Tg − 50 hidden — ` +
        "1000/(T − Tg + 50) has no value there.",
    );
  }
  return sentences.length > 0 ? sentences.join(" ") : null;
}

export interface ClickedTemperaturePoint {
  rowIndex: number;
  temperatureC: number;
  conductivity: number;
}

/**
 * Resolve a Plotly click back to the exact (row, temperature, conductivity)
 * it came from. `buildTemperatureLineTraces` concatenates many rows into
 * one trace per color slot, so `customdata` (the source row index) is the
 * only reliable link back — never `curveNumber`/`pointIndex`, which index
 * into the concatenated array, not the source data.
 *
 * Within one row, every mode's transform is monotonic in temperature
 * (Arrhenius and VFT strictly decreasing, T and T/Tg strictly increasing),
 * so no two points in the same row ever share an `x`; matching on `x`
 * (`y` as a tie-breaker) uniquely identifies which point was clicked.
 * `yAxis` says how the clicked `y` was plotted; the result always carries
 * the raw conductivity.
 */
export function resolveClickedPoint(
  mode: TemperatureMode,
  customdata: PlotlyDatum,
  x: PlotlyDatum,
  y: PlotlyDatum,
  yAxis: TemperatureYAxis = DEFAULT_TEMPERATURE_Y_AXIS,
): ClickedTemperaturePoint | null {
  if (typeof customdata !== "number" || typeof x !== "number" || typeof y !== "number") {
    return null;
  }

  const series = getTemperatureSeries(mode).find((s) => s.rowIndex === customdata);
  if (!series) return null;

  const point =
    series.points.find((p) => p.x === x && toYValue(p.y, yAxis) === y) ??
    series.points.find((p) => p.x === x);
  if (!point) return null;

  return { rowIndex: customdata, temperatureC: point.temperatureC, conductivity: point.y };
}

export interface FormattedConductivity {
  mantissa: string;
  exponent: number;
}

/**
 * Split a conductivity value into a 3-significant-figure mantissa and its
 * base-10 exponent, for rendering as "`mantissa` x 10^`exponent`" with a
 * real `<sup>` element. The inspector is plain DOM (unlike the Plotly axis
 * titles, which take the HTML sub/sup tags directly as a string).
 */
export function formatConductivity(valueScm: number): FormattedConductivity {
  const [mantissa, exponent] = valueScm.toExponential(2).split("e");
  return { mantissa, exponent: Number(exponent) };
}

export interface TemperatureInspectorData extends ClickedTemperaturePoint {
  polymer: string | null;
  doi: string | null;
}

/**
 * Combine a resolved click with the row's display fields the inspector
 * needs. `Row`'s cells are typed `number | string | null` generically, so
 * this narrows defensively even though DATA-SPEC.md says neither `polymer`
 * nor `doi` is ever blank in practice.
 */
export function buildInspectorData(clicked: ClickedTemperaturePoint): TemperatureInspectorData {
  const row = getRow(clicked.rowIndex);
  return {
    ...clicked,
    polymer: typeof row.polymer === "string" ? row.polymer : null,
    doi: typeof row.doi === "string" ? row.doi : null,
  };
}
