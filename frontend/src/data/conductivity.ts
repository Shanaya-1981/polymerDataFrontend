/**
 * Typed accessor over `generated/conductivity.json` — the 22 measurement
 * temperatures and each row's conductivity at each of them, kept as its own
 * artifact (rather than requiring 22 separate lookups into `dataset.ts`'s
 * numeric columns) because the temperature page's transforms iterate every
 * row across all 22 temperatures together.
 */
import conductivityJson from "./generated/conductivity.json";

interface ConductivityJsonShape {
  readonly temps: readonly number[];
  /** `values[row][temperatureIndex]`, S/cm or null. */
  readonly values: readonly (readonly (number | null)[])[];
}

const conductivity = conductivityJson as ConductivityJsonShape;

/** The 22 measurement temperatures, °C, in column order (also `values[row]`'s index order). */
export const TEMPERATURES_C: readonly number[] = conductivity.temps;

/** One row's conductivity across all 22 temperatures, S/cm or null. */
export function conductivityForRow(rowIndex: number): readonly (number | null)[] {
  return conductivity.values[rowIndex];
}

/** The full `[row][temperatureIndex]` matrix — what `@/lib/transforms` consumes directly. */
export function conductivityMatrix(): readonly (readonly (number | null)[])[] {
  return conductivity.values;
}
