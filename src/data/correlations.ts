/**
 * Typed accessor over `generated/correlations.json` — the 36x36 pairwise
 * Pearson correlation matrix computed from the forML CSV (DATA-SPEC.md §4).
 * Diagonal is exactly 1.0; see `@/lib/correlation` for how it's built and
 * `@/lib/correlation.test.ts` for the regression check against the
 * original's (buggy) matrix.
 */
import correlationsJson from "./generated/correlations.json";

interface CorrelationsJsonShape {
  readonly labels: readonly string[];
  readonly matrix: readonly (readonly number[])[];
}

const correlations = correlationsJson as CorrelationsJsonShape;

export const CORRELATION_LABELS: readonly string[] = correlations.labels;

/** The full label-ordered correlation matrix; `matrix[i][j]` correlates `labels[i]` with `labels[j]`. */
export function correlationMatrix(): readonly (readonly number[])[] {
  return correlations.matrix;
}

/** Look up one pairwise correlation by label. Returns `null` if either label is unknown. */
export function correlationBetween(labelA: string, labelB: string): number | null {
  const i = correlations.labels.indexOf(labelA);
  const j = correlations.labels.indexOf(labelB);
  if (i === -1 || j === -1) return null;
  return correlations.matrix[i][j];
}
