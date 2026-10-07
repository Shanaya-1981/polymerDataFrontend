/**
 * Turn correlation data into a sorted, signed ranking against one target —
 * the shared logic behind `/correlations`'s ranked-list view. A target
 * picker there offers either one of the 22 conductivity temperatures (read
 * `feature-target-correlations.json`, built by `scripts/build-data.ts` from
 * the main CSV) or one of the 36 glossary features (read a row of the
 * existing 36x36 matrix, `correlations.json`, built from the forML CSV) —
 * both funnel through {@link rankByAbsoluteCorrelation} so the UI has one
 * sorting/rendering path regardless of which data source produced the
 * numbers.
 *
 * No I/O, no React — pure data shaping, so this is unit-testable against
 * small synthetic inputs (see correlation-ranking.test.ts) without needing
 * jsdom or a chart runtime.
 */

/** One row of a ranked list: the *other* feature/column, its correlation
 *  against the chosen target, and how many samples that correlation is
 *  actually based on. `r` is never `null` here — {@link rankByAbsoluteCorrelation}
 *  drops entries whose correlation could not be computed at all (fewer than
 *  2 pairwise-complete points, or zero variance over the overlap; see
 *  `src/lib/correlation.ts`), since there is no honest position to rank an
 *  undefined value at. */
export interface RankedCorrelation {
  readonly label: string;
  readonly r: number;
  readonly n: number;
}

/** One correlation before ranking — `r` may be `null` (undefined correlation). */
export interface CorrelationEntry {
  readonly label: string;
  readonly r: number | null;
  readonly n: number;
}

/**
 * Sort by |r| descending — the strongest relationships first, regardless of
 * sign — with a deterministic tie-break on label so equal-|r| ties don't
 * reorder between renders. Drops any entry with a null `r`.
 */
export function rankByAbsoluteCorrelation(
  entries: readonly CorrelationEntry[],
): RankedCorrelation[] {
  const defined: RankedCorrelation[] = [];
  for (const entry of entries) {
    if (entry.r == null) continue;
    defined.push({ label: entry.label, r: entry.r, n: entry.n });
  }
  return defined.sort((a, b) => Math.abs(b.r) - Math.abs(a.r) || a.label.localeCompare(b.label));
}

/**
 * Build the ranked list for a conductivity-temperature target: zip the
 * parallel `labels`/`r`/`n` arrays for one temperature's row out of
 * `feature-target-correlations.json` into entries, then rank them. The
 * three arrays must be the same length (one per feature) — throws
 * otherwise, since a silent length mismatch would misattribute a label to
 * the wrong number rather than fail loudly.
 */
export function rankColumnarCorrelations(
  labels: readonly string[],
  r: readonly (number | null)[],
  n: readonly number[],
): RankedCorrelation[] {
  if (labels.length !== r.length || labels.length !== n.length) {
    throw new Error(
      `rankColumnarCorrelations: length mismatch (labels=${labels.length}, r=${r.length}, n=${n.length})`,
    );
  }
  return rankByAbsoluteCorrelation(labels.map((label, i) => ({ label, r: r[i], n: n[i] })));
}

/**
 * Build the ranked list for a feature target: read one row of the square
 * `labels` + `matrix` correlation data (`correlations.json`), excluding the
 * self pair on the diagonal, and rank the rest. Every off-diagonal cell of
 * that matrix shares one sample size (271 for the real generated matrix —
 * see DATA-SPEC.md §1 and `scripts/build-data.ts`'s own assertion that the
 * forML CSV has zero missing values across the 36 glossary columns), so it
 * is a caller-supplied constant here rather than something this function
 * derives — this module has no access to (and should not need) the raw
 * forML CSV columns just to report a count that never varies.
 */
export function rankMatrixRow(
  labels: readonly string[],
  matrix: readonly (readonly number[])[],
  targetLabel: string,
  sampleSize: number,
): RankedCorrelation[] {
  const targetIndex = labels.indexOf(targetLabel);
  if (targetIndex === -1) {
    throw new Error(`rankMatrixRow: unknown label ${JSON.stringify(targetLabel)}`);
  }
  const row = matrix[targetIndex];
  const entries: CorrelationEntry[] = [];
  for (let i = 0; i < labels.length; i++) {
    if (i === targetIndex) continue; // exclude the self pair (r === 1 by construction)
    entries.push({ label: labels[i], r: row[i], n: sampleSize });
  }
  return rankByAbsoluteCorrelation(entries);
}

/** Floor so a low-n bar stays visibly present rather than fading away. */
const COVERAGE_FLOOR = 0.3;

/**
 * How "authoritative" one row's sample size looks relative to the largest
 * `n` in the same ranked list — used to visually de-emphasize (never hide)
 * a correlation built on a small pairwise-complete overlap, per the wave
 * brief: "a bar built on n=30 must not look as authoritative as one on
 * n=389." Returns 1 when `n === maxN` (as authoritative as this view gets)
 * down to {@link COVERAGE_FLOOR} as `n` shrinks toward 0. `maxN` is the
 * largest `n` *within the current ranked list*, not the dataset's total row
 * count — coverage is inherently relative to what a given target's own data
 * allows, not to the whole dataset.
 */
export function relativeCoverage(n: number, maxN: number): number {
  if (maxN <= 0) return 1;
  const ratio = Math.min(Math.max(n / maxN, 0), 1);
  return COVERAGE_FLOOR + (1 - COVERAGE_FLOOR) * ratio;
}
