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
import type { LineSample, PlotlyDatum } from "@/components/charts";
import { categoricalColumn, filterRows, getRow, getTemperatureSeries, rankOf } from "@/data";
import type { FilterSelections } from "@/lib/filtering";
import type { TemperatureMode } from "@/lib/transforms";
import type { TemperatureColorColumn } from "./state";

/** DATA-SPEC.md: "no categorical column has blanks" — this should be dead
 *  code in practice, but `categoricalColumn` is typed `string | null`, so a
 *  total fallback keeps `buildLineSamples` from needing to throw on it. */
const UNKNOWN_CATEGORY_LABEL = "Unknown";

export const CONDUCTIVITY_Y_AXIS_TITLE = "Conductivity (S cm<sup>-1</sup>)";

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
      y: series.points.map((point) => point.y),
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
 */
export function resolveClickedPoint(
  mode: TemperatureMode,
  customdata: PlotlyDatum,
  x: PlotlyDatum,
  y: PlotlyDatum,
): ClickedTemperaturePoint | null {
  if (typeof customdata !== "number" || typeof x !== "number" || typeof y !== "number") {
    return null;
  }

  const series = getTemperatureSeries(mode).find((s) => s.rowIndex === customdata);
  if (!series) return null;

  const point =
    series.points.find((p) => p.x === x && p.y === y) ?? series.points.find((p) => p.x === x);
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
