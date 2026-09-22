/**
 * Pairwise-complete Pearson correlation — DATA-SPEC.md §4 / §8.
 *
 * The original standardized with population std (ddof=0) but took the
 * sample covariance (ddof=1), multiplying every entry of the correlation
 * matrix by n/(n-1) = 271/270 ≈ 1.0037037. Plain Pearson correlation has no
 * such mismatch: its diagonal is exactly 1.0 by construction. This module
 * has no I/O — `scripts/build-data.ts` feeds it parsed columns from the
 * forML CSV, and `correlation.test.ts` feeds it small synthetic arrays plus
 * the real generated output.
 */

/**
 * Pearson correlation over the positions where both arrays have a non-null
 * value ("pairwise-complete"). Returns `null` if fewer than 2 overlapping
 * points exist, or either has zero variance over that overlap (undefined
 * correlation) — both are genuine "can't compute this" cases, not zeros.
 */
export function pearsonCorrelation(
  a: readonly (number | null)[],
  b: readonly (number | null)[],
): number | null {
  let n = 0;
  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x == null || y == null) continue;
    n += 1;
    sumA += x;
    sumB += y;
  }
  if (n < 2) return null;

  const meanA = sumA / n;
  const meanB = sumB / n;
  let sumXY = 0;
  let sumXX = 0;
  let sumYY = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x == null || y == null) continue;
    const dx = x - meanA;
    const dy = y - meanB;
    sumXY += dx * dy;
    sumXX += dx * dx;
    sumYY += dy * dy;
  }
  if (sumXX === 0 || sumYY === 0) return null;
  return sumXY / Math.sqrt(sumXX * sumYY);
}

export interface CorrelationMatrix {
  readonly labels: readonly string[];
  /** `matrix[i][j]` is the correlation between `labels[i]` and `labels[j]`. */
  readonly matrix: readonly (readonly number[])[];
}

/**
 * Build a full symmetric correlation matrix over `labels`, reading each
 * label's values out of `columns`. The diagonal is set to exactly `1`
 * without going through the correlation formula — a value correlates
 * perfectly with itself by definition, and hardcoding it sidesteps any
 * floating-point noise from computing it.
 */
export function buildCorrelationMatrix(
  labels: readonly string[],
  columns: Readonly<Record<string, readonly (number | null)[]>>,
): CorrelationMatrix {
  const n = labels.length;
  const matrix: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));

  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      const r = pearsonCorrelation(columns[labels[i]], columns[labels[j]]);
      if (r == null) {
        throw new Error(
          `buildCorrelationMatrix: undefined correlation between ${JSON.stringify(
            labels[i],
          )} and ${JSON.stringify(labels[j])} (insufficient overlap or zero variance)`,
        );
      }
      matrix[i][j] = r;
      matrix[j][i] = r;
    }
  }

  return { labels: [...labels], matrix };
}
