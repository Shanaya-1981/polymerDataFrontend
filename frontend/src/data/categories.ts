/**
 * Typed accessor over `generated/categories.json` — the frozen, once-over-
 * the-full-dataset category order per categorical column (DATA-SPEC.md §7).
 * Color/symbol assignment (`slotForRank` in `@/styles/chart-palette`) keys
 * off the rank this returns, so it must never be recomputed from a filtered
 * subset — that would repaint surviving series on every interaction.
 */
import categoriesJson from "./generated/categories.json";
import type { FrozenCategoryColumnId } from "./generated/columns";
import { categoryRank } from "@/lib/category-order";

type CategoriesJsonShape = Readonly<Record<FrozenCategoryColumnId, readonly string[]>>;

const categories = categoriesJson as CategoriesJsonShape;

/** The frozen, frequency-descending (ties: first appearance) category order for one column. */
export function categoryOrder(columnId: FrozenCategoryColumnId): readonly string[] {
  return categories[columnId];
}

/** A value's 0-based rank in its column's frozen order, or `-1` if unknown (folds to "Other"). */
export function rankOf(columnId: FrozenCategoryColumnId, value: string): number {
  return categoryRank(categories[columnId], value);
}
