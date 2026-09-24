import type { ImportedGroup } from "@/components/charts";
import { FROZEN_CATEGORY_COLUMN_IDS, rankOf, type FrozenCategoryColumnId } from "@/data";

const FROZEN_IDS: ReadonlySet<string> = new Set(FROZEN_CATEGORY_COLUMN_IDS);

/**
 * Split imported rows by their value in a categorical column, so each
 * formulation gets its own toggleable legend entry. Categories come in the
 * dataset's frozen order (DATA-SPEC.md §7) — the order its own legend uses —
 * then values the dataset doesn't have, in first-appearance order, then rows
 * with no value (`label: null`). A file without the column at all comes back
 * as a single unlabelled group.
 */
export function groupImportedByCategory<T>(
  items: readonly T[],
  columnId: string,
  valueOf: (item: T) => string | number | null,
): ImportedGroup<T>[] {
  const byValue = new Map<string | null, T[]>();
  for (const item of items) {
    const value = valueOf(item);
    const key = value == null ? null : String(value);
    const group = byValue.get(key);
    if (group) group.push(item);
    else byValue.set(key, [item]);
  }

  const rank = (label: string) =>
    FROZEN_IDS.has(columnId) ? rankOf(columnId as FrozenCategoryColumnId, label) : -1;
  // Map keys keep insertion order, i.e. first appearance in the file.
  const labels = [...byValue.keys()].filter((key): key is string => key !== null);
  const known = labels.filter((label) => rank(label) >= 0).sort((a, b) => rank(a) - rank(b));
  const unknown = labels.filter((label) => rank(label) < 0);

  const groups: ImportedGroup<T>[] = [...known, ...unknown].map((label) => ({
    label,
    items: byValue.get(label) ?? [],
  }));
  const blank = byValue.get(null);
  if (blank) groups.push({ label: null, items: blank });
  return groups;
}
