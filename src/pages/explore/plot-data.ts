/**
 * Pure data-shaping for the Explore scatter plot. Row selection itself comes
 * from `@/data`'s `filterRows`/`@/lib/filtering`; everything here turns that
 * row-index list plus the current axis/color choices into `series.ts`
 * input, plus the two notices this rebuild is required to surface —
 * the log-axis hazard (DATA-SPEC.md §3) and high-cardinality color columns
 * (CHART-PALETTE.md's overflow rule). No DOM and no Plotly runtime import
 * (only its trace-shape types), so this is unit-testable without jsdom's
 * missing canvas/WebGL.
 */
import {
  categoricalColumn,
  categoryOrder,
  numericColumn,
  rankOf,
  type CategoricalColumnId,
  type FrozenCategoryColumnId,
  type NumericColumnId,
} from "@/data";
import { filterRowIndices, type FilterSelections } from "@/lib/filtering";
import { applyAxisScale, type AxisScale } from "@/lib/log-axis";
import type {
  CategoricalPoint,
  ContinuousPoint,
  ImportedPoint,
  ScatterSeriesInput,
} from "@/components/charts";
import { MAX_CATEGORICAL_SLOTS } from "@/styles/chart-palette";
import { axisTitle, getColumnMeta } from "./columns";
import type { ImportedDataset } from "./csv-import";

// ---------------------------------------------------------------------------
// Log-axis hazard — DATA-SPEC.md §3
// ---------------------------------------------------------------------------

export interface AxisNotice {
  readonly droppedCount: number;
  /** Non-null values considered for this axis among the given rows —
   *  `kept.length + droppedCount`, i.e. the denominator in "N of M". */
  readonly consideredCount: number;
  readonly columnLabel: string;
}

/**
 * How many of `rowIndices`' values for `columnId` are hidden specifically
 * because `scale` is `"log"` — computed over whatever row subset it's given
 * (the currently filtered view), not the full dataset, so the notice stays
 * accurate as the user filters. Returns `null` when there is nothing to
 * warn about: the column is unknown or categorical (log has no meaning for
 * a category axis), the scale is `"linear"`, or nothing was actually
 * dropped.
 */
export function buildAxisNotice(
  columnId: string,
  scale: AxisScale,
  rowIndices: readonly number[],
): AxisNotice | null {
  if (scale !== "log") return null;
  const meta = getColumnMeta(columnId);
  if (!meta || meta.kind !== "continuous") return null;

  const column = numericColumn(columnId as NumericColumnId);
  const values = rowIndices.map((row) => column[row]);
  const { kept, droppedCount } = applyAxisScale(values, scale);
  if (droppedCount === 0) return null;

  return { droppedCount, consideredCount: kept.length + droppedCount, columnLabel: meta.label };
}

/**
 * Calm, factual notice text, deliberately close to DATA-SPEC.md §3's own
 * example ("287 of 368 points hidden — a log axis can't show values ≤ 0"),
 * extended just enough to disambiguate which axis and which column when
 * both X and Y can independently trigger this.
 */
export function axisNoticeMessage(axisLabel: "X" | "Y", notice: AxisNotice): string {
  return (
    `${notice.droppedCount} of ${notice.consideredCount} ${axisLabel}-axis points hidden — a log axis ` +
    `can't show ${notice.columnLabel} values ≤ 0.`
  );
}

// ---------------------------------------------------------------------------
// Building the actual scatter points
// ---------------------------------------------------------------------------

type AxisRawValue = number | string | null;

/**
 * One (x, y) pair for a row, or `null` if the row can't be plotted: missing
 * on either axis, or non-positive on an axis currently scaled to log.
 * Missing values are dropped silently (they were never going to render
 * regardless of scale); log-axis drops are what `buildAxisNotice` separately
 * counts and reports.
 */
function plottableXY(
  xValues: readonly AxisRawValue[],
  yValues: readonly AxisRawValue[],
  index: number,
  xScale: AxisScale,
  yScale: AxisScale,
): { x: number | string; y: number | string } | null {
  const x = xValues[index];
  const y = yValues[index];
  if (x == null || y == null) return null;
  if (xScale === "log" && typeof x === "number" && x <= 0) return null;
  if (yScale === "log" && typeof y === "number" && y <= 0) return null;
  return { x, y };
}

function axisValues(columnId: string, rowIndices: readonly number[]): AxisRawValue[] {
  const meta = getColumnMeta(columnId);
  if (meta?.kind === "categorical") {
    const column = categoricalColumn(columnId as CategoricalColumnId);
    return rowIndices.map((row) => column[row]);
  }
  const column = numericColumn(columnId as NumericColumnId);
  return rowIndices.map((row) => column[row]);
}

export interface ExplorePointsResult {
  readonly seriesInput: ScatterSeriesInput;
  /** Rows actually plotted — `<= rowIndices.length`, per `plottableXY`. */
  readonly plottedCount: number;
}

/**
 * Turn a filtered row-index list into `series.ts` input for the current
 * x/y/color choices.
 *
 * The `as FrozenCategoryColumnId` cast below is only reached when
 * `colorMeta.kind === "categorical"`, and the page only ever offers
 * `PLOTTABLE_COLUMN_IDS` as color choices (`columns.ts`) — a set whose
 * categorical members (`polymerFamily`, `polymer`, `anion`, `crystalline`,
 * `solventUsed`) are all frozen-order columns. DOI is deliberately excluded
 * from that set (see `columns.ts`), so it can never reach `rankOf` here.
 *
 * Throws only for a genuinely unknown column id — the page is expected to
 * sanitize ids against `PLOTTABLE_COLUMN_IDS` first (`controls-state.ts`),
 * so this should never fire from user interaction, only from a programming
 * error.
 */
export function buildExplorePoints(
  rowIndices: readonly number[],
  xColumnId: string,
  xScale: AxisScale,
  yColumnId: string,
  yScale: AxisScale,
  colorColumnId: string,
): ExplorePointsResult {
  const xMeta = getColumnMeta(xColumnId);
  const yMeta = getColumnMeta(yColumnId);
  const colorMeta = getColumnMeta(colorColumnId);
  if (!xMeta || !yMeta || !colorMeta) {
    throw new Error(
      `buildExplorePoints: unknown column id (x=${xColumnId}, y=${yColumnId}, color=${colorColumnId})`,
    );
  }

  const xValues = axisValues(xColumnId, rowIndices);
  const yValues = axisValues(yColumnId, rowIndices);

  if (colorMeta.kind === "categorical") {
    const colorColumn = categoricalColumn(colorColumnId as CategoricalColumnId);
    const points: CategoricalPoint[] = [];
    rowIndices.forEach((rowIndex, i) => {
      const xy = plottableXY(xValues, yValues, i, xScale, yScale);
      if (!xy) return;
      const category = colorColumn[rowIndex];
      if (category == null) return; // no categorical column has blanks (DATA-SPEC.md §5); guard anyway
      const rank = rankOf(colorColumnId as FrozenCategoryColumnId, category);
      points.push({ x: xy.x, y: xy.y, rank, category, rowIndex });
    });
    return { seriesInput: { kind: "categorical", points }, plottedCount: points.length };
  }

  const colorColumn = numericColumn(colorColumnId as NumericColumnId);
  const points: ContinuousPoint[] = [];
  rowIndices.forEach((rowIndex, i) => {
    const xy = plottableXY(xValues, yValues, i, xScale, yScale);
    if (!xy) return;
    points.push({ x: xy.x, y: xy.y, colorValue: colorColumn[rowIndex] ?? null, rowIndex });
  });
  return {
    seriesInput: { kind: "continuous", points, colorAxisTitle: axisTitle(colorColumnId) },
    plottedCount: points.length,
  };
}

// ---------------------------------------------------------------------------
// User-imported rows (csv-import.ts) — same axis rules as the dataset
// ---------------------------------------------------------------------------

/** One column of an imported file, or `undefined` if the file lacked it. */
function importedColumn(
  imported: ImportedDataset,
  columnId: string,
): readonly AxisRawValue[] | undefined {
  if (getColumnMeta(columnId)?.kind === "categorical") {
    return imported.categorical[columnId as CategoricalColumnId];
  }
  return imported.numeric[columnId as NumericColumnId];
}

export interface ImportedPointsResult {
  readonly points: readonly ImportedPoint[];
  readonly totalCount: number;
  /** Rows passing the active filters — `<= totalCount`. */
  readonly matchingFilterCount: number;
  /** Axes whose column the file doesn't have at all. */
  readonly missingAxes: readonly ("X" | "Y")[];
}

/**
 * Imported rows as overlay points for the current view: filtered with the
 * same AND-across/OR-within rule as the dataset (a row lacking a filtered
 * column fails that filter), then run through the same `plottableXY` gate —
 * missing values and non-positive values on a log axis never plot.
 */
export function buildImportedPoints(
  imported: ImportedDataset,
  filters: FilterSelections,
  xColumnId: string,
  xScale: AxisScale,
  yColumnId: string,
  yScale: AxisScale,
  colorColumnId: string,
): ImportedPointsResult {
  const rowIndices = filterRowIndices(imported.rowCount, imported.categorical, filters);
  const xColumn = importedColumn(imported, xColumnId);
  const yColumn = importedColumn(imported, yColumnId);
  const colorColumn = importedColumn(imported, colorColumnId);

  const missingAxes: ("X" | "Y")[] = [];
  if (!xColumn) missingAxes.push("X");
  if (!yColumn) missingAxes.push("Y");

  const points: ImportedPoint[] = [];
  if (xColumn && yColumn) {
    for (const row of rowIndices) {
      const xy = plottableXY(xColumn, yColumn, row, xScale, yScale);
      if (!xy) continue;
      points.push({ x: xy.x, y: xy.y, rowNumber: row + 1, colorValue: colorColumn?.[row] ?? null });
    }
  }

  return {
    points,
    totalCount: imported.rowCount,
    matchingFilterCount: rowIndices.length,
    missingAxes,
  };
}

/**
 * Why some or all imported rows aren't on the chart, or `null` when every
 * row is. Mirrors the log-axis notice: the plot never hides user data
 * without saying so.
 */
export function importedNoticeMessage(
  result: ImportedPointsResult,
  xColumnId: string,
  yColumnId: string,
): string | null {
  if (result.missingAxes.length > 0) {
    const labels = result.missingAxes.map(
      (axis) => `"${getColumnMeta(axis === "X" ? xColumnId : yColumnId)?.label ?? ""}"`,
    );
    const missing = labels.length === 1 ? `${labels[0]} column` : `${labels.join(" or ")} columns`;
    return `The imported file has no ${missing}, so its rows can't be placed on these axes.`;
  }

  const plotted = result.points.length;
  if (plotted === result.totalCount) return null;

  const filteredOut = result.totalCount - result.matchingFilterCount;
  const unplottable = result.matchingFilterCount - plotted;
  const reasons: string[] = [];
  if (filteredOut > 0) reasons.push(`${filteredOut} don't match the active filters`);
  if (unplottable > 0) {
    reasons.push(`${unplottable} have a missing X or Y value, or one a log axis can't show (≤ 0)`);
  }
  return `${plotted} of ${result.totalCount} imported rows plotted: ${reasons.join("; ")}.`;
}

// ---------------------------------------------------------------------------
// High-cardinality color columns — CHART-PALETTE.md's overflow rule
// ---------------------------------------------------------------------------

/**
 * Per CHART-PALETTE.md's overflow table, `Polymer` (78 distinct) and `DOI`
 * (65 distinct) are named as "too many" — coloring by either is
 * near-useless, unlike `Anion`/`Solvent used`/`Polymer family`, which clear
 * >=82% top-7 coverage and fold acceptably. DOI is not one of the 41
 * selectable color options (`columns.ts` excludes it), so this is otherwise
 * inert for DOI today; the id is kept here in case that selection ever
 * changes.
 */
const NEAR_USELESS_COLOR_COLUMN_IDS: ReadonlySet<string> = new Set(["polymer", "doi"]);

export interface HighCardinalityNotice {
  readonly distinctCount: number;
  /** 0-100, one decimal place. */
  readonly topCoveragePercent: number;
  readonly columnLabel: string;
}

const categoryCountsCache = new Map<FrozenCategoryColumnId, ReadonlyMap<string, number>>();

/** Value -> row count for one frozen categorical column, over the full
 *  (unfiltered) dataset. Memoized: the source array never changes at
 *  runtime, mirroring `@/data/dataset.ts`'s own `getRows` memoization. */
export function categoryCounts(columnId: FrozenCategoryColumnId): ReadonlyMap<string, number> {
  const cached = categoryCountsCache.get(columnId);
  if (cached) return cached;

  const counts = new Map<string, number>();
  for (const value of categoricalColumn(columnId)) {
    if (value == null) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  categoryCountsCache.set(columnId, counts);
  return counts;
}

/**
 * `null` unless `colorColumnId` is one of the named near-useless columns.
 * Coverage is computed over the full dataset, never the filtered view —
 * DATA-SPEC.md §7's "never rank the filtered subset" applies equally to
 * describing whether an encoding is usable at all, not just to color
 * assignment, since the point is to describe the column choice itself.
 */
export function highCardinalityNotice(colorColumnId: string): HighCardinalityNotice | null {
  if (!NEAR_USELESS_COLOR_COLUMN_IDS.has(colorColumnId)) return null;
  const meta = getColumnMeta(colorColumnId);
  if (!meta) return null;

  const id = colorColumnId as FrozenCategoryColumnId;
  const counts = categoryCounts(id);
  let total = 0;
  let inTop = 0;
  counts.forEach((count, value) => {
    total += count;
    if (rankOf(id, value) < MAX_CATEGORICAL_SLOTS) inTop += count;
  });

  return {
    distinctCount: categoryOrder(id).length,
    topCoveragePercent: total === 0 ? 0 : Math.round((inTop / total) * 1000) / 10,
    columnLabel: meta.label,
  };
}

export function highCardinalityMessage(notice: HighCardinalityNotice): string {
  return (
    `${notice.columnLabel} has ${notice.distinctCount} distinct values — only the 7 most common get their ` +
    `own color (${notice.topCoveragePercent}% of rows); the rest render as "Other". Try filtering to fewer ` +
    `values, or use the Data table for exact lookups.`
  );
}

// ---------------------------------------------------------------------------
// Empty states
// ---------------------------------------------------------------------------

export type ExploreEmptyReason = "no-rows-match-filters" | "no-plottable-points" | null;

/**
 * Why nothing would render, if anything — checked in this order because a
 * zero-row filter result is a more specific, more actionable explanation
 * than "zero of zero rows plotted".
 */
export function exploreEmptyReason(
  filteredCount: number,
  plottedCount: number,
): ExploreEmptyReason {
  if (filteredCount === 0) return "no-rows-match-filters";
  if (plottedCount === 0) return "no-plottable-points";
  return null;
}
