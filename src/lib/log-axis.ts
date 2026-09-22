/**
 * Log-axis hazard handling — DATA-SPEC.md §3.
 *
 * Non-positive values are mathematically undefined on a log axis. The
 * original just fed them to Plotly and produced a misleadingly sparse (or
 * empty) plot with no explanation — e.g. a `Tg` axis set to Log silently
 * drops 78% of points (287 of 368 non-null values are ≤ 0, since Tg is in °C
 * and mostly negative). We drop them explicitly and report how many, so the
 * UI can surface a visible notice. Never clamp to a small positive epsilon —
 * that fabricates a value that was never measured.
 */
export type AxisScale = "linear" | "log";

export interface AxisValue {
  /** Index into the original array this value came from — for re-joining to a row/series. */
  readonly index: number;
  readonly value: number;
}

export interface LogAxisResult {
  /** Values safe to plot on the requested scale, in original order. */
  readonly kept: readonly AxisValue[];
  /**
   * Count of values that were present (non-null) but hidden specifically
   * because of the log transform (i.e. non-positive). Always `0` for
   * `"linear"`. Missing/null source values are never counted here — they
   * were never going to be plotted regardless of axis type.
   */
  readonly droppedCount: number;
}

/**
 * Filter a column of (possibly missing) values for a given axis scale.
 * `null`/`undefined` entries are always omitted (they are missing data, not
 * a log-axis casualty) without contributing to `droppedCount`.
 */
export function applyAxisScale(
  values: readonly (number | null | undefined)[],
  scale: AxisScale,
): LogAxisResult {
  const kept: AxisValue[] = [];
  let droppedCount = 0;

  values.forEach((value, index) => {
    if (value == null) return; // missing data — not a log-axis casualty
    if (scale === "log" && value <= 0) {
      droppedCount += 1;
      return;
    }
    kept.push({ index, value });
  });

  return { kept, droppedCount };
}
