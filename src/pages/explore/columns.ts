/**
 * Explore-page column bookkeeping: which of the dataset's columns can be
 * plotted (x/y/color) versus only filtered on, plus small display helpers
 * shared by the axis pickers and the filter panel.
 *
 * Plottable and filterable are deliberately different sets in the generated
 * registry: `DOI` is `filterableOn: ["explore", "temperature"]` but
 * `plottableOn: []`, because this rebuild lets you filter by paper (the
 * upgrade over the original's single-column `prefiltervis`) while DOI was
 * never one of the original's 41 x/y/color options. Reading `plottableOn`
 * therefore gives exactly 41 here, matching `ui-controls.json`
 * label-for-label and in the same order.
 */
import {
  COLUMN_BY_ID,
  FROZEN_CATEGORY_COLUMN_IDS,
  NUMERIC_COLUMN_IDS,
  type CategoricalColumnId,
  type ColumnMeta,
  type FrozenCategoryColumnId,
} from "@/data";
import type { ComboboxOption } from "@/components/ui";
import { columnDisplayName } from "@/lib/column-format";

/**
 * Safe lookup: `COLUMN_BY_ID[id]` is typed as always-defined (the generated
 * registry doesn't declare an index signature that admits `undefined`), but
 * a hand-edited URL can supply an id that was never generated. This restores
 * the honest `| undefined` for any id coming from outside the app itself.
 */
const columnById = COLUMN_BY_ID as Readonly<Record<string, ColumnMeta | undefined>>;

export function getColumnMeta(id: string): ColumnMeta | undefined {
  return columnById[id];
}

const PLOTTABLE_CATEGORICAL_IDS: readonly FrozenCategoryColumnId[] =
  FROZEN_CATEGORY_COLUMN_IDS.filter((id) => COLUMN_BY_ID[id].plottableOn.includes("explore"));

const PLOTTABLE_NUMERIC_IDS = NUMERIC_COLUMN_IDS.filter((id) =>
  COLUMN_BY_ID[id].plottableOn.includes("explore"),
);

/** The 41 columns offered by the x/y/color pickers, in the original's order
 *  (numeric columns, then the 5 plottable categoricals) — DATA-SPEC.md §1. */
export const PLOTTABLE_COLUMN_IDS: readonly string[] = [
  ...PLOTTABLE_NUMERIC_IDS,
  ...PLOTTABLE_CATEGORICAL_IDS,
];

/** DOI, Polymer family, Polymer, Anion, crystalline?, Solvent used — every
 *  column with a frozen category order, all six offered as filters (the
 *  task's deliberate upgrade over the original's single-column,
 *  single-value `prefiltervis`). */
export const FILTERABLE_COLUMN_IDS: readonly FrozenCategoryColumnId[] = FROZEN_CATEGORY_COLUMN_IDS;

export function isKnownPlottableColumn(id: string): boolean {
  return PLOTTABLE_COLUMN_IDS.includes(id);
}

export function isCategoricalColumn(id: string): id is CategoricalColumnId {
  return getColumnMeta(id)?.kind === "categorical";
}

/** Plain display label for a column (no unit) — what the axis/color
 *  Comboboxes show. */
export function columnLabel(id: string): string {
  return getColumnMeta(id)?.label ?? id;
}

/** Axis/colorbar title: the column's label, with its unit parenthesized
 *  where the registry has one (e.g. "approxTg (°C)"). */
export function axisTitle(id: string): string {
  return columnDisplayName(getColumnMeta(id), id);
}

export const PLOTTABLE_COLUMN_OPTIONS: readonly ComboboxOption[] = PLOTTABLE_COLUMN_IDS.map(
  (id) => ({
    value: id,
    label: columnLabel(id),
  }),
);

/**
 * Human label for one filter option value. DOI values are full URLs
 * (`https://doi.org/10.1016/...`); this drops the common prefix so the
 * multi-select's list and chips stay scannable. The unmodified value is
 * still what's stored, filtered on, and linked to elsewhere (the point
 * inspector renders the real DOI URL, not this shortened form).
 */
export function filterValueLabel(columnId: FrozenCategoryColumnId, value: string): string {
  if (columnId === "doi") return value.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
  return value;
}
