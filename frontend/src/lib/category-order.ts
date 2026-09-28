/**
 * Canonical category ordering — DATA-SPEC.md §7.
 *
 * A category's color must never change when the user filters, so trace/color
 * order is computed ONCE over the full dataset (never a filtered subset) and
 * frozen. The rule: global frequency descending, ties broken by first
 * appearance in the source CSV. This differs from the original site, which
 * ordered purely by first appearance (verified live order for `Anion` is
 * `TFSI, N(SO2C2F5)2, BF4, ClO4, CF3SO3, …` — first-appearance, not
 * frequency). Downstream color/symbol assignment (`slotForRank` in
 * `src/styles/chart-palette.ts`) keys off the index into the array this
 * produces.
 */
export function rankCategories(values: readonly string[]): string[] {
  const counts = new Map<string, number>();
  const firstSeenAt = new Map<string, number>();

  values.forEach((value, i) => {
    counts.set(value, (counts.get(value) ?? 0) + 1);
    if (!firstSeenAt.has(value)) {
      firstSeenAt.set(value, i);
    }
  });

  return [...counts.keys()].sort((a, b) => {
    const byFrequency = (counts.get(b) ?? 0) - (counts.get(a) ?? 0);
    if (byFrequency !== 0) return byFrequency;
    return (firstSeenAt.get(a) ?? 0) - (firstSeenAt.get(b) ?? 0);
  });
}

/**
 * Look up a value's 0-based rank in a frozen category order. Returns `-1`
 * (not `undefined`) for a value outside the known order, matching the
 * "out of range folds to Other" convention `slotForRank` already uses.
 */
export function categoryRank(order: readonly string[], value: string): number {
  return order.indexOf(value);
}
