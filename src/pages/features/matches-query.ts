import type { FeatureGlossaryEntry } from "./feature-glossary";

/**
 * Case-insensitive substring match across every field a researcher might
 * search by: the display name, the description, the literal ML column
 * name, and the feature number.
 *
 * Pulled out of `FeatureGlossaryTable.tsx` (rather than defined inline) so
 * that component file only exports a component — react-refresh requires
 * that for fast refresh to work.
 */
export function matchesQuery(entry: FeatureGlossaryEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return true;
  return (
    entry.feature.toLowerCase().includes(q) ||
    entry.description.toLowerCase().includes(q) ||
    entry.mlColumn.toLowerCase().includes(q) ||
    String(entry.number) === q
  );
}
