/**
 * Free-text search across the data table's text columns.
 */
import { CATEGORICAL_COLUMN_IDS, type Row } from "@/data";

/**
 * Every text column search matches against: the six columns also offered as
 * filters (Polymer family, Polymer, Anion, crystalline?, Solvent used, DOI)
 * plus the four free-form text columns — Reference, Notes, and both SMILES
 * descriptors — that have no frozen category order (DATA-SPEC.md §7) and so
 * are never offered as a filter, only as search text.
 */
export const SEARCHABLE_COLUMN_IDS = CATEGORICAL_COLUMN_IDS;

/**
 * Case-insensitive substring match across every searchable text column. An
 * empty (or all-whitespace) query matches every row, matching `/features`'
 * `matchesQuery` convention.
 */
export function matchesSearch(row: Row, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return true;

  for (const id of SEARCHABLE_COLUMN_IDS) {
    const value = row[id];
    if (typeof value === "string" && value.toLowerCase().includes(q)) return true;
  }
  return false;
}
