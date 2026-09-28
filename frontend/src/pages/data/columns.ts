/**
 * Data-table column bookkeeping: which of the dataset's 69 typed columns
 * (see the generated registry re-exported from `@/data`) are shown by
 * default, the full list offered by the "Columns" picker, and small display
 * helpers (label with unit, shortened DOI text) specific to this page.
 *
 * Deliberately NOT shared with `src/pages/explore/columns.ts`: that module's
 * `PLOTTABLE_COLUMN_IDS` is scoped to the 41 columns the original site's
 * x/y/color pickers offered, which excludes several columns this table still
 * wants to show (DOI, Reference, Notes, both SMILES descriptors, and every
 * per-temperature conductivity column beyond 30/60/90C). Duplicating the
 * handful of lines below keeps the two pages independently ownable, per the
 * wave brief's file-ownership split.
 */
import { COLUMNS, COLUMN_BY_ID, type ColumnId, type ColumnMeta } from "@/data";
import type { MultiSelectOption } from "@/components/ui";
import { columnDisplayName } from "@/lib/column-format";

/**
 * `COLUMN_BY_ID[id]` is typed as always-defined (the generated registry
 * doesn't declare an index signature that admits `undefined`), but a
 * hand-edited URL can supply an id that was never generated. This restores
 * the honest `| undefined` for any id coming from outside the app itself —
 * the same workaround `explore/columns.ts` uses, for the same reason.
 */
const columnById = COLUMN_BY_ID as Readonly<Record<string, ColumnMeta | undefined>>;

export function getColumnMeta(id: string): ColumnMeta | undefined {
  return columnById[id];
}

const ALL_COLUMN_IDS: ReadonlySet<string> = new Set(COLUMNS.map((column) => column.id));

/** Type guard: is this string one of the dataset's real column ids? Narrows
 *  so downstream code can index a `Row` without an `as` cast. */
export function isColumnId(id: string): id is ColumnId {
  return ALL_COLUMN_IDS.has(id);
}

/** Plain display label for a column (no unit) — e.g. "approxTg". */
export function columnLabel(id: string): string {
  return getColumnMeta(id)?.label ?? id;
}

/**
 * Table-header text: the column's label with its unit parenthesized where
 * the registry has one, e.g. "approxTg (°C)" — unless the label already
 * ends in that exact "(unit)" text, which nine of the generated columns'
 * literal CSV headers already do (`approxMW(kDa)`, `Arrhenius Ea (eV)`,
 * `Polymer Mn (kDa)`, `drying time (h)`, and five more — verified by
 * sanity-checking every {label, unit} pair in the generated registry).
 * Blindly appending there would print "approxMW(kDa) (kDa)"; this was
 * caught by an actual browser render, not by the type checker or a test.
 *
 * Shared with `/explore`'s axis titles via `columnDisplayName` so the two
 * cannot drift — they previously had independent copies, one of which
 * carried the doubling bug.
 */
export function columnHeading(id: string): string {
  return columnDisplayName(getColumnMeta(id), id);
}

/**
 * Identity plus the headline measurements, per the wave brief: Polymer,
 * Polymer family, Anion, crystalline?, Solvent used, approxTg,
 * approxMW(kDa), Li:functional group, two conductivities, and DOI. This is
 * deliberately a short, opinionated starting point (11 of the 69 available
 * columns) rather than an attempt at a "complete" default — the point of the
 * picker is that any of the remaining 58 are one click away.
 */
export const DEFAULT_COLUMN_IDS: readonly ColumnId[] = [
  "polymer",
  "polymerFamily",
  "anion",
  "crystalline",
  "solventUsed",
  "approxTg",
  "approxMWKDa",
  "liFunctionalGroup",
  "conductivityAt30C",
  "conductivityAt60C",
  "doi",
];

/** Every column the picker can add, in the generated registry's own order. */
export const ALL_COLUMN_OPTIONS: readonly MultiSelectOption[] = COLUMNS.map((column) => ({
  value: column.id,
  label: columnHeading(column.id),
}));

/**
 * Validate a URL-supplied column id list down to ones that actually exist —
 * a hand-edited link can name anything, including nothing at all (an
 * explicit "show only the row-number column" choice, which `useUrlState`
 * represents as a single empty-string entry — see its own doc comment on
 * explicit-empty arrays). Order is preserved (it's what the table renders
 * left to right) and duplicates are dropped.
 */
export function resolveColumnIds(raw: readonly string[]): ColumnId[] {
  const seen = new Set<string>();
  const result: ColumnId[] = [];
  for (const id of raw) {
    if (isColumnId(id) && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result;
}

/**
 * DOI values are full URLs (`https://doi.org/10.1016/...`); this drops the
 * common prefix so the link text stays short enough for a table cell. The
 * `href` a caller renders should still use the untouched value. Mirrors the
 * one-line rule in `src/pages/explore/columns.ts` — duplicated rather than
 * imported, for the file-ownership reason in this module's header comment.
 */
export function shortenDoi(value: string): string {
  return value.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
}
