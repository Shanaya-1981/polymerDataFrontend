/**
 * The four temperature-page x-axis transforms — DATA-SPEC.md §6.
 *
 * `T/Tg` and `VFT` use the raw `Tg` column ONLY (368 non-null rows), never
 * `approxTg` (441 rows, used on the scatter/Explore page). This is called
 * out in DATA-SPEC.md §1 as "the single easiest thing to get wrong": the two
 * pages deliberately read different columns.
 */
export type TemperatureMode = "Arrhenius" | "T" | "T/Tg" | "VFT";

export const TEMPERATURE_MODES: readonly TemperatureMode[] = ["Arrhenius", "T", "T/Tg", "VFT"];

/** Axis titles verbatim from the live site (HTML sub/superscript tags included, as Plotly expects). */
export const TEMPERATURE_MODE_AXIS_TITLES: Readonly<Record<TemperatureMode, string>> = {
  Arrhenius: "1000/T (K<sup>-1</sup>)",
  T: "T (<sup>o</sup>C)",
  "T/Tg": "T/T<sub>g</sub>",
  VFT: "1000/(T-T<sub>g</sub>+50) (K<sup>-1</sup>)",
};

/** Does this mode need a raw Tg value to compute x? (Both `T/Tg` and `VFT` do.) */
export function modeRequiresTg(mode: TemperatureMode): boolean {
  return mode === "T/Tg" || mode === "VFT";
}

const KELVIN_OFFSET = 273.15;

/**
 * Compute the x value for one (temperature, Tg) pair under a given mode.
 * Returns `null` when the mode needs Tg and none is available — callers
 * should skip the point rather than plot a bogus value.
 *
 * @param temperatureC measurement temperature in °C
 * @param tgC raw `Tg` in °C (NOT `approxTg`); `null` if unknown
   */
export function transformTemperature(
  mode: TemperatureMode,
  temperatureC: number,
  tgC: number | null,
): number | null {
  switch (mode) {
    case "Arrhenius":
      return 1000 / (temperatureC + KELVIN_OFFSET);
    case "T":
      return temperatureC;
    case "T/Tg":
      if (tgC == null) return null;
      return (temperatureC + KELVIN_OFFSET) / (tgC + KELVIN_OFFSET);
    case "VFT":
      if (tgC == null) return null;
      return 1000 / (temperatureC - tgC + 50);
  }
}

/** One measured (temperature, conductivity) sample transformed onto a mode's x-axis. */
export interface TemperaturePoint {
  /** Source measurement temperature, °C — kept for tooltips/debugging. */
  readonly temperatureC: number;
  readonly x: number;
  readonly y: number;
}

/** All transformed points for one dataset row. */
export interface TemperatureSeries {
  /** 0-based row index into the dataset (stable join key back to `dataset.json`). */
  readonly rowIndex: number;
  readonly points: readonly TemperaturePoint[];
}

/**
 * Build one series per dataset row for a given mode.
 *
 * Deliberately mirrors the original's row-per-series behavior rather than
 * pre-filtering: `Arrhenius`/`T` return one entry for EVERY row (655),
 * including the 36 with no conductivity at all, which end up with an empty
 * `points` array; `T/Tg`/`VFT` return one entry per row with a non-null raw
 * `Tg` (368), some of which may also end up empty. This matches the
 * series/point counts captured from the live site in
 * `live-figure-fixtures.json` (655/5225, 655/5225, 368/3401, 368/3401) and
 * keeps this function trivially testable against that fixture.
 *
 * Per DATA-SPEC.md §8, "an empty series is not a line": a chart consuming
 * this should filter out entries with zero points before rendering
 * (`series.filter((s) => s.points.length > 0)`) rather than skip them here,
 * so this stays the single source of truth for "which rows participate in
 * this mode" that other counts can be checked against.
 *
 * @param temperaturesC the 22 measurement temperatures, °C, in column order
 * @param conductivity `conductivity[row][temperatureIndex]`, S/cm or null
 * @param rawTg the raw `Tg` column (368 non-null of 655), NOT `approxTg`
 */
export function buildTemperatureSeries(
  mode: TemperatureMode,
  temperaturesC: readonly number[],
  conductivity: readonly (readonly (number | null)[])[],
  rawTg: readonly (number | null)[],
): TemperatureSeries[] {
  const needsTg = modeRequiresTg(mode);
  const series: TemperatureSeries[] = [];

  for (let row = 0; row < conductivity.length; row++) {
    const tg = rawTg[row] ?? null;
    if (needsTg && tg == null) continue;

    const rowConductivity = conductivity[row];
    const points: TemperaturePoint[] = [];
    for (let t = 0; t < temperaturesC.length; t++) {
      const y = rowConductivity[t];
      if (y == null) continue;
      const x = transformTemperature(mode, temperaturesC[t], needsTg ? tg : null);
      if (x == null) continue;
      points.push({ temperatureC: temperaturesC[t], x, y });
    }
    series.push({ rowIndex: row, points });
  }

  return series;
}

/** Total point count across a set of series — convenience for tests/summaries. */
export function countPoints(series: readonly TemperatureSeries[]): number {
  return series.reduce((sum, s) => sum + s.points.length, 0);
}
