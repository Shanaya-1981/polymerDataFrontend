/**
 * The temperature page's four x-axis modes, wired to the real dataset and
 * memoized per mode (there are only 4 possible modes, so a small cache
 * keyed by mode is all the memoization this needs).
 */
import { buildTemperatureSeries, type TemperatureMode, type TemperatureSeries } from "@/lib/transforms";
import { TEMPERATURES_C, conductivityMatrix } from "./conductivity";
import { numericColumn } from "./dataset";

const cache = new Map<TemperatureMode, readonly TemperatureSeries[]>();

/**
 * One series per row for the given mode — 655 rows for `Arrhenius`/`T`, 368
 * (rows with a non-null raw `Tg`) for `T/Tg`/`VFT`. Some series may have
 * zero points (e.g. the 36 rows with no conductivity at all); per
 * DATA-SPEC.md §8, filter those out before handing series to a chart:
 * `getTemperatureSeries(mode).filter((s) => s.points.length > 0)`.
 */
export function getTemperatureSeries(mode: TemperatureMode): readonly TemperatureSeries[] {
  const cached = cache.get(mode);
  if (cached) return cached;

  const series = buildTemperatureSeries(mode, TEMPERATURES_C, conductivityMatrix(), numericColumn("tg"));
  cache.set(mode, series);
  return series;
}
