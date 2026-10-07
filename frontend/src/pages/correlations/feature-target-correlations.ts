/**
 * Typed accessor over `generated/feature-target-correlations.json` — each of
 * 35 glossary features (all but `drying vacuum`; see
 * {@link FEATURE_TARGET_EXCLUDED_FEATURE}) vs log10(conductivity) at each of
 * the 22 measurement temperatures, computed from the **main** CSV
 * (`scripts/build-data.ts`). The existing 36x36 matrix (`@/data/correlations`)
 * is forML-only and feature-vs-feature, so it cannot answer "what
 * correlates with conductivity" — this file exists to answer exactly that.
 *
 * Colocated with the page rather than under `src/data/`: this agent's file
 * ownership for the ranked-correlation-view task is scoped to
 * `src/pages/correlations/`, `src/data/generated/`, and one `src/lib/`
 * module — not the rest of `src/data/` (its accessor modules, `index.ts`).
 */
import featureTargetCorrelationsJson from "@/data/generated/feature-target-correlations.json";

export interface ExcludedFeature {
  readonly mlColumn: string;
  readonly reason: string;
}

interface FeatureTargetCorrelationsJsonShape {
  readonly temperatures: readonly number[];
  readonly features: readonly string[];
  readonly excludedFeature: ExcludedFeature;
  readonly matrixSampleSize: number;
  readonly r: readonly (readonly (number | null)[])[];
  readonly n: readonly (readonly number[])[];
}

const data = featureTargetCorrelationsJson as FeatureTargetCorrelationsJsonShape;

/** The 22 conductivity measurement temperatures, °C — same set and order as `@/data`'s `TEMPERATURES_C`. */
export const FEATURE_TARGET_TEMPERATURES_C: readonly number[] = data.temperatures;

/** The 35 glossary features this table covers (36 minus `drying vacuum`), in the same order as each row's `r`/`n`. */
export const FEATURE_TARGET_FEATURES: readonly string[] = data.features;

/** Which glossary feature this table leaves out, and why — see build-data.ts for the full reasoning. */
export const FEATURE_TARGET_EXCLUDED_FEATURE: ExcludedFeature = data.excludedFeature;

/** Sample size shared by every off-diagonal cell of the 36x36 feature-vs-feature matrix (`@/data/correlations`) — the forML CSV has zero missing values across the 36 glossary columns (build-data.ts asserts this), so it is one constant rather than something computed per pair. */
export const MATRIX_SAMPLE_SIZE: number = data.matrixSampleSize;

/**
 * One temperature's row: `r`/`n` in the same order as
 * {@link FEATURE_TARGET_FEATURES}. Throws for a temperature outside the 22
 * measured — every caller already knows it's one of
 * {@link FEATURE_TARGET_TEMPERATURES_C}.
 */
export function featureTargetRow(temperatureC: number): {
  r: readonly (number | null)[];
  n: readonly number[];
} {
  const index = data.temperatures.indexOf(temperatureC);
  if (index === -1) {
    throw new Error(`featureTargetRow: no feature-target data for ${temperatureC}°C`);
  }
  return { r: data.r[index], n: data.n[index] };
}
