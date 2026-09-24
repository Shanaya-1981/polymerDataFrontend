/**
 * Palette → Plotly traces. Pure data-shaping functions (no DOM access, no
 * Plotly runtime calls) — see `PlotlyChart.tsx` for the component that
 * actually renders what these build. Kept pure so this is easy to unit test
 * without a canvas/WebGL context (see `series.test.ts`).
 *
 * The data layer (owned by a parallel agent, `src/data/` / `src/lib/`) may
 * not exist yet, so this file defines the minimal local input shapes it
 * needs (`CategoricalPoint`, `ContinuousPoint`, `LineSample`,
 * `CorrelationMatrix`) rather than importing row types from there. Map your
 * richer row type down to these at the call site.
 */
import {
  CHART_PALETTE,
  IMPORTED_SLOT,
  MAX_CATEGORICAL_SLOTS,
  OTHER_SLOT,
  slotForRank,
} from "@/styles/chart-palette";
import type { ChartThemeMode } from "./theme";
import type { ColorScale, Data, Layout } from "./plotly";

const OTHER_LABEL = "Other";

/**
 * Exact literal type of `SERIES_SYMBOLS`'s values (`chart-palette.ts`),
 * narrower than Plotly's own exported `MarkerSymbol` (which is really just
 * `string | number | (string | number)[]` and too wide to satisfy a
 * `ScatterData`/`ScatterglData` marker's generated literal-union type). Used
 * only to cast `slotForRank`'s `symbol` (typed as plain `string`, since
 * chart-palette.ts isn't Plotly-aware) back to something Plotly accepts.
 */
type ScatterMarkerSymbol =
  | "circle"
  | "square"
  | "diamond"
  | "triangle-up"
  | "cross"
  | "triangle-down"
  | "x"
  | "circle-open"
  | "star";

/** Plotly trace type to render scatter-family series as. Defaults to SVG
 *  `scatter`: this app's largest plot is 5,225 points, well inside SVG's
 *  comfort zone, and SVG exports crisp PNGs for publication. `scattergl` is
 *  kept in the union for future large datasets but is NOT registered in
 *  `plotly.ts` — registering it costs 143 KB gzipped. Selecting it without
 *  registering it first will fail at render time. */
export type ScatterTraceType = "scatter" | "scattergl";

export interface ScatterTraceOptions {
  /** @default "scatter" */
  traceType?: ScatterTraceType;
  /** Marker diameter in px. @default 7 */
  markerSize?: number;
}

const DEFAULT_TRACE_TYPE: ScatterTraceType = "scatter";
const DEFAULT_MARKER_SIZE = 7;

/**
 * Same slot-selection rule as `slotForRank` (see `src/styles/chart-palette.ts`
 * — ranks `>= MAX_CATEGORICAL_SLOTS` fold into "Other", never cycled), but
 * resolved to a concrete hex value for the given theme mode instead of a
 * `var(--chart-N)` reference.
 *
 * Plotly renders scatter/scattergl/heatmap marks outside the CSS cascade —
 * SVG presentation attributes and WebGL/canvas fills don't resolve
 * `var()` — so trace colors must be concrete hex, unlike plain-DOM chart
 * chrome (legends, swatches) built outside Plotly, which should still
 * prefer `slot.cssVar`. See chart-palette.ts's own doc comment and
 * PlotlyChart.tsx for the same constraint on the layout side.
 */
export function resolveSlotColor(rank: number, mode: ChartThemeMode): string {
  const { isOther } = slotForRank(rank);
  const slot = isOther ? OTHER_SLOT : CHART_PALETTE[rank];
  return mode === "dark" ? slot.dark : slot.light;
}

/** Minimal shape this module needs for one categorical scatter point. */
export interface CategoricalPoint {
  x: number | string | null;
  y: number | string | null;
  /** 0-based rank in the frozen, dataset-wide category order (DATA-SPEC.md
   *  §7). Ranks `>= MAX_CATEGORICAL_SLOTS` fold into "Other". */
  rank: number;
  /** Human-readable category label (hover text, legend). All points
   *  sharing a rank are expected to share this — see slotForRank's fold
   *  rule; the fold group's own label is fixed to "Other" regardless. */
  category: string;
  /** Source row index, carried through as `customdata` for click-to-select. */
  rowIndex: number;
}

/** Minimal shape this module needs for one continuous-color scatter point. */
export interface ContinuousPoint {
  x: number | string | null;
  y: number | string | null;
  /** The color column's numeric value for this point (`null` = missing —
   *  Plotly's marker colorscale renders a null-colored point as a gap in
   *  the colorscale mapping, not a dropped point). */
  colorValue: number | null;
  rowIndex: number;
}

export type ScatterSeriesInput =
  | { kind: "categorical"; points: readonly CategoricalPoint[] }
  | { kind: "continuous"; points: readonly ContinuousPoint[]; colorAxisTitle?: string };

/**
 * Build one Plotly trace per populated color slot (named categories in
 * frequency-rank order, then one trailing "Other" trace for every rank
 * folded past `MAX_CATEGORICAL_SLOTS`) — at most 8 traces regardless of how
 * many distinct categories exist. Marker `symbol` varies per slot alongside
 * color: CHART-PALETTE.md requires this as a secondary encoding, since
 * light-mode CVD ΔE (8.2) only just clears the 8.0 gate.
 */
export function buildCategoricalScatterTraces(
  points: readonly CategoricalPoint[],
  mode: ChartThemeMode,
  options: ScatterTraceOptions = {},
): Data[] {
  const traceType = options.traceType ?? DEFAULT_TRACE_TYPE;
  const markerSize = options.markerSize ?? DEFAULT_MARKER_SIZE;

  interface Group {
    key: number;
    label: string;
    points: CategoricalPoint[];
  }
  const groups = new Map<number, Group>();

  for (const point of points) {
    const { isOther } = slotForRank(point.rank);
    // MAX_CATEGORICAL_SLOTS doubles as the "Other" bucket's key: it is by
    // definition the smallest rank slotForRank/resolveSlotColor treat as
    // out-of-range, so re-running either on this key resolves to OTHER_SLOT
    // with no special-casing needed here.
    const key = isOther ? MAX_CATEGORICAL_SLOTS : point.rank;
    let group = groups.get(key);
    if (!group) {
      group = { key, label: isOther ? OTHER_LABEL : point.category, points: [] };
      groups.set(key, group);
    }
    group.points.push(point);
  }

  return Array.from(groups.values())
    .sort((a, b) => a.key - b.key)
    .map((group): Data => {
      const { symbol } = slotForRank(group.key);
      const color = resolveSlotColor(group.key, mode);
      return {
        type: traceType,
        mode: "markers",
        name: group.label,
        x: group.points.map((p) => p.x),
        y: group.points.map((p) => p.y),
        customdata: group.points.map((p) => p.rowIndex),
        marker: { color, symbol: symbol as ScatterMarkerSymbol, size: markerSize },
        hovertemplate: "%{fullData.name}<br>x: %{x}<br>y: %{y}<extra></extra>",
      };
    });
}

/** Single-hue sequential ramp for numeric color columns — Plotly's built-in
 *  named scale, not a hex literal, per CHART-PALETTE.md ("Viridis is
 *  acceptable and is perceptually uniform... never a rainbow"). */
export const SEQUENTIAL_COLORSCALE: ColorScale = "Viridis";

/**
 * Build the single trace used when the color column is numeric: one
 * `scattergl`/`scatter` trace with `marker.color` bound to the value array
 * and a colorbar, instead of N categorical traces — the categorical palette
 * does not apply to continuous data (chart-palette.ts).
 */
export function buildContinuousScatterTrace(
  points: readonly ContinuousPoint[],
  options: ScatterTraceOptions & { colorAxisTitle?: string; name?: string } = {},
): Data {
  const traceType = options.traceType ?? DEFAULT_TRACE_TYPE;
  const markerSize = options.markerSize ?? DEFAULT_MARKER_SIZE;
  return {
    type: traceType,
    mode: "markers",
    ...(options.name ? { name: options.name } : {}),
    x: points.map((p) => p.x),
    y: points.map((p) => p.y),
    customdata: points.map((p) => p.rowIndex),
    marker: {
      color: points.map((p) => p.colorValue),
      colorscale: SEQUENTIAL_COLORSCALE,
      showscale: true,
      size: markerSize,
      colorbar: options.colorAxisTitle ? { title: { text: options.colorAxisTitle } } : undefined,
    },
  };
}

/**
 * One entry point for the scatter page's color mode: dispatches to the
 * categorical (many traces, hue + symbol) or continuous (one trace,
 * sequential colorscale) builder depending on `input.kind`. Both branches
 * remain individually exported/testable above.
 */
export function buildScatterTraces(
  input: ScatterSeriesInput,
  mode: ChartThemeMode,
  options: ScatterTraceOptions & {
    /** Legend name for the lone continuous trace. Only needed once another
     *  trace shares the legend — Plotly would otherwise call it "trace 0". */
    continuousName?: string;
  } = {},
): Data[] {
  const { continuousName, ...traceOptions } = options;
  if (input.kind === "categorical") {
    return buildCategoricalScatterTraces(input.points, mode, traceOptions);
  }
  return [
    buildContinuousScatterTrace(input.points, {
      ...traceOptions,
      colorAxisTitle: input.colorAxisTitle,
      name: continuousName,
    }),
  ];
}

/** One user-imported row, already resolved to plottable (x, y). */
export interface ImportedPoint {
  x: number | string;
  y: number | string;
  /** 1-based data-row number in the imported file (header excluded). */
  rowNumber: number;
  /** This row's value for the current color column, shown in hover text —
   *  imported points keep their own fixed color, so the value is the only
   *  place the color column shows up for them. */
  colorValue: number | string | null;
}

export const IMPORTED_TRACE_NAME = "Imported";
const IMPORTED_HOVERTEMPLATE = `${IMPORTED_TRACE_NAME}, %{text}<br>x: %{x}<br>y: %{y}<extra></extra>`;

/** User-supplied text ends up in Plotly's pseudo-HTML hover labels. */
function escapeHoverText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** The "<br>Anion: TFSI" tail of an imported point's hover text. */
function importedColorText(colorLabel: string | undefined, value: number | string | null): string {
  if (!colorLabel) return "";
  const shown = value == null ? "—" : escapeHoverText(String(value));
  return `<br>${escapeHoverText(colorLabel)}: ${shown}`;
}

/** `IMPORTED_SLOT`'s outlined star, shared by both overlay builders. */
function importedMarker(mode: ChartThemeMode, size: number) {
  return {
    color: mode === "dark" ? IMPORTED_SLOT.dark : IMPORTED_SLOT.light,
    symbol: IMPORTED_SLOT.symbol,
    size,
    line: {
      color: mode === "dark" ? IMPORTED_SLOT.outlineDark : IMPORTED_SLOT.outlineLight,
      width: 1.5,
    },
  };
}

/**
 * The overlay trace for user-imported rows: one trace, a fixed out-of-
 * palette color and a `star` symbol (`IMPORTED_SLOT`), and its own legend
 * entry so it can be toggled. Carries no `customdata` on purpose — the
 * page's click handler treats a numeric `customdata` as a dataset row
 * index, and these rows aren't in the dataset.
 */
export function buildImportedScatterTrace(
  points: readonly ImportedPoint[],
  mode: ChartThemeMode,
  options: Pick<ScatterTraceOptions, "traceType"> & { colorLabel?: string } = {},
): Data {
  const traceType = options.traceType ?? DEFAULT_TRACE_TYPE;
  return {
    type: traceType,
    mode: "markers",
    name: IMPORTED_TRACE_NAME,
    showlegend: true,
    x: points.map((p) => p.x),
    y: points.map((p) => p.y),
    text: points.map(
      (p) => `row ${p.rowNumber}${importedColorText(options.colorLabel, p.colorValue)}`,
    ),
    marker: importedMarker(mode, 13),
    hovertemplate: IMPORTED_HOVERTEMPLATE,
  };
}

/** One imported row's conductivity curve, already on the Temperature
 *  page's x-axis. `x`, `y` and `temperaturesC` are equal length. */
export interface ImportedLineSample {
  x: readonly number[];
  y: readonly number[];
  /** Measurement temperature (°C) behind each point, for hover text. */
  temperaturesC: readonly number[];
  /** 1-based data-row number in the imported file (header excluded). */
  rowNumber: number;
  /** This row's value for the current color column (hover text only). */
  colorValue: string | null;
}

/**
 * The Temperature page's overlay: every imported row's curve concatenated
 * into one `null`-separated trace (as `buildNullSeparatedGroups` does per
 * color slot), drawn as a line through the same outlined stars as the
 * Explore overlay. `text` stays index-aligned with `x`/`y`, holding `""`
 * at each separator. No `customdata`, for the reason given on
 * `buildImportedScatterTrace` — here it would be worse than a no-op, since
 * `resolveClickedPoint` matches on the same transformed x values dataset
 * rows use.
 */
export function buildImportedLineTrace(
  samples: readonly ImportedLineSample[],
  mode: ChartThemeMode,
  options: Pick<ScatterTraceOptions, "traceType"> & { colorLabel?: string } = {},
): Data {
  const traceType = options.traceType ?? DEFAULT_TRACE_TYPE;
  const x: (number | null)[] = [];
  const y: (number | null)[] = [];
  const text: string[] = [];

  for (const sample of samples) {
    if (sample.x.length === 0) continue;
    if (x.length > 0) {
      x.push(null);
      y.push(null);
      text.push("");
    }
    const colorText = importedColorText(options.colorLabel, sample.colorValue);
    sample.x.forEach((value, i) => {
      x.push(value);
      y.push(sample.y[i]);
      text.push(`row ${sample.rowNumber}, ${sample.temperaturesC[i]} °C${colorText}`);
    });
  }

  const marker = importedMarker(mode, 10);
  return {
    type: traceType,
    mode: "lines+markers",
    name: IMPORTED_TRACE_NAME,
    showlegend: true,
    x,
    y,
    text,
    connectgaps: false,
    line: { color: marker.color, width: 2 },
    marker,
    hovertemplate: IMPORTED_HOVERTEMPLATE,
  };
}

/** Imported rows sharing one value of the page's color column (e.g. every
 *  TFSI row) — one toggleable legend entry each. */
export interface ImportedGroup<T> {
  /** The category, or `null` for rows with no value in that column. */
  label: string | null;
  items: readonly T[];
}

/** Plotly's id for a second legend — the imported rows' own. */
const IMPORTED_LEGEND_ID = "legend2";

/**
 * Whether imported traces get their own legend: yes as soon as any row has
 * a category to toggle it by. A lone unlabelled group — a numeric color
 * column, or a file without the color column — stays a single "Imported"
 * entry in the main legend.
 */
export function hasImportedLegend(groups: readonly ImportedGroup<unknown>[]): boolean {
  return groups.some((group) => group.label !== null);
}

/**
 * Layout for `hasImportedLegend` charts: the imported entries as a titled
 * row above the plot, clear of the dataset's legend on the right however
 * long either gets, and a matching title on the dataset's. With two
 * legends Plotly makes each title clickable — a click toggles that whole
 * legend, a double-click shows it alone — so hiding all imported rows is
 * still one click, as it was with the single "Imported" entry.
 */
export const IMPORTED_LEGEND_LAYOUT = {
  legend: { title: { text: "<b>Dataset</b>" } },
  [IMPORTED_LEGEND_ID]: {
    title: { text: `<b>${IMPORTED_TRACE_NAME}</b>` },
    orientation: "h",
    x: 0,
    xanchor: "left",
    y: 1.02,
    yanchor: "bottom",
  },
} satisfies Record<string, Partial<Layout>["legend"]>;

/** Legend name for one imported group — rows with no value get their own. */
function importedGroupName(label: string | null, colorLabel: string | undefined): string {
  return label ?? `No ${colorLabel ?? "value"}`;
}

/** Move a trace into the imported legend under `name`. Which legend a trace
 *  belongs to (`legend`) postdates @types/plotly.js, hence the cast. */
function inImportedLegend(trace: Data, name: string): Data {
  return { ...trace, name, legend: IMPORTED_LEGEND_ID } as Data;
}

/**
 * `buildImportedScatterTrace` once per group: one trace per formulation in
 * the imported legend, each toggled on its own, or the single "Imported"
 * trace when there is nothing to split by (see `hasImportedLegend`).
 */
export function buildImportedScatterTraces(
  groups: readonly ImportedGroup<ImportedPoint>[],
  mode: ChartThemeMode,
  options: Pick<ScatterTraceOptions, "traceType"> & { colorLabel?: string } = {},
): Data[] {
  const traces = groups.map((group) => buildImportedScatterTrace(group.items, mode, options));
  if (!hasImportedLegend(groups)) return traces;
  return traces.map((trace, i) =>
    inImportedLegend(trace, importedGroupName(groups[i].label, options.colorLabel)),
  );
}

/** `buildImportedLineTrace` once per group — see `buildImportedScatterTraces`. */
export function buildImportedLineTraces(
  groups: readonly ImportedGroup<ImportedLineSample>[],
  mode: ChartThemeMode,
  options: Pick<ScatterTraceOptions, "traceType"> & { colorLabel?: string } = {},
): Data[] {
  const traces = groups.map((group) => buildImportedLineTrace(group.items, mode, options));
  if (!hasImportedLegend(groups)) return traces;
  return traces.map((trace, i) =>
    inImportedLegend(trace, importedGroupName(groups[i].label, options.colorLabel)),
  );
}

/** One sample's full line (e.g. one row's conductivity-vs-temperature
 *  series on the Temperature page). `x`/`y` must be equal length. */
export interface LineSample {
  x: readonly number[];
  y: readonly number[];
  rank: number;
  category: string;
  rowIndex: number;
}

export interface NullSeparatedGroup {
  /** Slot key — see `buildCategoricalScatterTraces`'s note on why this
   *  doubles as the "Other" bucket key. */
  key: number;
  label: string;
  x: (number | null)[];
  y: (number | null)[];
  /** Same length as `x`/`y`. Holds each point's source row index, and
   *  `null` at every separator — so `customdata[i]` is only ever read at an
   *  index Plotly could actually have rendered a point at. */
  customdata: (number | null)[];
}

/**
 * Concatenate many per-row line samples that share a color slot into a
 * single `null`-separated series, so the Temperature page renders at most 8
 * line traces instead of one per sample (the original emitted 655 —
 * ~1&nbsp;MB per interaction). A `null` in `x`/`y` breaks the line between
 * two samples without Plotly interpolating across them; the matching
 * `null` in `customdata` keeps all three arrays the same length so
 * `customdata[i]` always lines up with `(x[i], y[i])`.
 *
 * This is the trickiest piece in this file — see `series.test.ts` for the
 * index-mapping tests (a click on any real point must resolve back to the
 * correct source row, even after several samples have been concatenated).
 */
export function buildNullSeparatedGroups(samples: readonly LineSample[]): NullSeparatedGroup[] {
  const groups = new Map<number, NullSeparatedGroup>();

  for (const sample of samples) {
    if (sample.x.length !== sample.y.length) {
      throw new Error(
        `buildNullSeparatedGroups: sample for rowIndex ${sample.rowIndex} has mismatched ` +
          `x/y lengths (${sample.x.length} vs ${sample.y.length}).`,
      );
    }
    if (sample.x.length === 0) continue; // nothing to plot, and no separator to add either

    const { isOther } = slotForRank(sample.rank);
    const key = isOther ? MAX_CATEGORICAL_SLOTS : sample.rank;
    let group = groups.get(key);
    if (!group) {
      group = { key, label: isOther ? OTHER_LABEL : sample.category, x: [], y: [], customdata: [] };
      groups.set(key, group);
    }

    // A separator goes *between* samples, never before the first or after
    // the last — so: prepend one whenever the group already has data.
    if (group.x.length > 0) {
      group.x.push(null);
      group.y.push(null);
      group.customdata.push(null);
    }

    for (let i = 0; i < sample.x.length; i += 1) {
      group.x.push(sample.x[i]);
      group.y.push(sample.y[i]);
      group.customdata.push(sample.rowIndex);
    }
  }

  return Array.from(groups.values()).sort((a, b) => a.key - b.key);
}

/** Marker diameter on the Temperature page's curves: enough to show where
 *  each real measurement sits on its line, small enough that all 5,225 of
 *  them don't bury the lines. */
const TEMPERATURE_MARKER_SIZE = 4;

/**
 * `buildNullSeparatedGroups` plus the theme-resolved color/name each group
 * needs to become a Plotly trace — the Temperature page's entry point. A
 * small same-colored dot marks every measurement, so a curve shows where
 * data exists and where the line is only joining it up.
 */
export function buildTemperatureLineTraces(
  samples: readonly LineSample[],
  mode: ChartThemeMode,
  options: Pick<ScatterTraceOptions, "traceType"> = {},
): Data[] {
  const traceType = options.traceType ?? DEFAULT_TRACE_TYPE;
  return buildNullSeparatedGroups(samples).map((group): Data => {
    const color = resolveSlotColor(group.key, mode);
    return {
      type: traceType,
      mode: "lines+markers",
      name: group.label,
      x: group.x,
      y: group.y,
      customdata: group.customdata,
      connectgaps: false,
      line: { color, width: 1.5 },
      marker: { color, size: TEMPERATURE_MARKER_SIZE, symbol: "circle" },
      hovertemplate: `${group.label}<br>x: %{x}<br>y: %{y}<extra></extra>`,
    };
  });
}

/** A square, symmetric correlation matrix — the forML-CSV-derived 36×36
 *  Pearson matrix from DATA-SPEC.md §4 (diagonal exactly 1.0). */
export interface CorrelationMatrix {
  /** Row/column labels, in display order. */
  labels: readonly string[];
  /** `z[i][j]` is the correlation between `labels[i]` and `labels[j]`, in `[-1, 1]`. */
  z: readonly (readonly number[])[];
}

/**
 * Diverging colorscale for the correlation heatmap: two hues from the
 * already-validated categorical palette (slot 2 blue for −1, slot 1
 * pink-red for +1 — the conventional cool/negative, warm/positive
 * pairing) with a neutral gray midpoint pinned at 0. CHART-PALETTE.md
 * specifies the *shape* of this scale (diverging, neutral-gray midpoint)
 * but not exact colors the way it does for the categorical palette, so
 * this reuses existing validated/semantic tokens rather than inventing a
 * new hue: `--chart-1`/`--chart-2` (chart-palette.ts) for the endpoints and
 * `--color-default` (theme.css's mid-gray border token) for the midpoint.
 * This is a deliberate interpretation — flagged in the wave hand-off notes.
 */
function divergingColorscale(mode: ChartThemeMode): ColorScale {
  const negative = mode === "dark" ? CHART_PALETTE[1].dark : CHART_PALETTE[1].light; // blue
  const positive = mode === "dark" ? CHART_PALETTE[0].dark : CHART_PALETTE[0].light; // pink-red
  const neutralGray = mode === "dark" ? "#68686f" : "#8c8c95"; // mirrors --color-default
  return [
    [0, negative],
    [0.5, neutralGray],
    [1, positive],
  ];
}

/**
 * Build the correlation heatmap trace: one `heatmap` trace, diverging
 * colorscale, symmetric domain pinned at 0 — never the original's Plasma
 * (sequential) scale on this diverging (−1…+1) data (CHART-PALETTE.md).
 */
export function buildCorrelationHeatmapTrace(
  matrix: CorrelationMatrix,
  mode: ChartThemeMode,
): Data {
  return {
    type: "heatmap",
    x: [...matrix.labels],
    y: [...matrix.labels],
    z: matrix.z.map((row) => [...row]),
    zmin: -1,
    zmid: 0,
    zmax: 1,
    colorscale: divergingColorscale(mode),
    colorbar: { title: { text: "Pearson r" } },
    hoverongaps: false,
    hovertemplate: "%{x} × %{y}<br>r = %{z:.3f}<extra></extra>",
  };
}
