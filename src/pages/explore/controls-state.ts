/**
 * The Explore page's control state, round-tripped through the URL via
 * `@/lib/url-state`'s `useUrlState` — so a configured plot (axes, scales,
 * color, and every active filter) is a shareable link, per the wave brief.
 *
 * Param names are short and readable: `x`, `y`, `color`, `xscale`, `yscale`
 * for the plot controls, and — for filters — the column's own stable id
 * (`polymerFamily`, `polymer`, `anion`, `crystalline`, `solventUsed`,
 * `doi`) holding its selected values as a repeated param
 * (`?anion=TFSI&anion=ClO4`). Using the column id directly (rather than a
 * generic `filter[]` scheme) keeps a link readable at a glance and needs no
 * extra parsing beyond what `useUrlState` already does for array-valued
 * params.
 *
 * `useUrlState` itself only round-trips strings — it doesn't validate that
 * e.g. `xscale` is actually `"linear"` or `"log"`, since a URL is
 * user-editable text. `resolveExploreState` is where that validation
 * happens, falling back to the documented default for anything
 * unrecognized (an unknown column id, a garbled scale value) rather than
 * letting bad input reach the data layer.
 */
import { useCallback, useMemo } from "react";
import { useUrlState, type UrlStateValue } from "@/lib/url-state";
import type { FilterSelections } from "@/lib/filtering";
import type { AxisScale } from "@/lib/log-axis";
import type { FrozenCategoryColumnId } from "@/data";
import { isKnownPlottableColumn } from "./columns";

export const DEFAULT_X_COLUMN = "approxTg";
export const DEFAULT_Y_COLUMN = "conductivityAt60C";
export const DEFAULT_COLOR_COLUMN = "anion";
export const DEFAULT_X_SCALE: AxisScale = "linear";
export const DEFAULT_Y_SCALE: AxisScale = "log";

export interface ExploreUrlState {
  // `useUrlState`'s `T extends UrlState` constraint is checked structurally
  // against an index signature, which a plain interface doesn't have by
  // default — this makes the shape explicit rather than widening every
  // field to `UrlStateValue`.
  [key: string]: UrlStateValue;
  x: string;
  y: string;
  color: string;
  xscale: string;
  yscale: string;
  polymerFamily: readonly string[];
  polymer: readonly string[];
  anion: readonly string[];
  crystalline: readonly string[];
  solventUsed: readonly string[];
  doi: readonly string[];
}

const EXPLORE_DEFAULTS: ExploreUrlState = {
  x: DEFAULT_X_COLUMN,
  y: DEFAULT_Y_COLUMN,
  color: DEFAULT_COLOR_COLUMN,
  xscale: DEFAULT_X_SCALE,
  yscale: DEFAULT_Y_SCALE,
  polymerFamily: [],
  polymer: [],
  anion: [],
  crystalline: [],
  solventUsed: [],
  doi: [],
};

export function resolveColumnId(raw: string, fallback: string): string {
  return isKnownPlottableColumn(raw) ? raw : fallback;
}

export function resolveAxisScale(raw: string, fallback: AxisScale): AxisScale {
  return raw === "linear" || raw === "log" ? raw : fallback;
}

export interface ResolvedExploreState {
  x: string;
  xScale: AxisScale;
  y: string;
  yScale: AxisScale;
  color: string;
  filters: FilterSelections;
}

/** Validate raw (user-editable) URL state into values the rest of the page
 *  can trust — an unrecognized column id or scale falls back to its
 *  documented default rather than reaching the data layer. */
export function resolveExploreState(raw: ExploreUrlState): ResolvedExploreState {
  return {
    x: resolveColumnId(raw.x, DEFAULT_X_COLUMN),
    xScale: resolveAxisScale(raw.xscale, DEFAULT_X_SCALE),
    y: resolveColumnId(raw.y, DEFAULT_Y_COLUMN),
    yScale: resolveAxisScale(raw.yscale, DEFAULT_Y_SCALE),
    color: resolveColumnId(raw.color, DEFAULT_COLOR_COLUMN),
    filters: {
      polymerFamily: raw.polymerFamily,
      polymer: raw.polymer,
      anion: raw.anion,
      crystalline: raw.crystalline,
      solventUsed: raw.solventUsed,
      doi: raw.doi,
    },
  };
}

export interface UseExploreControlsResult {
  readonly raw: ExploreUrlState;
  readonly resolved: ResolvedExploreState;
  readonly setX: (id: string) => void;
  readonly setY: (id: string) => void;
  readonly setColor: (id: string) => void;
  readonly setXScale: (scale: AxisScale) => void;
  readonly setYScale: (scale: AxisScale) => void;
  readonly setFilter: (columnId: FrozenCategoryColumnId, values: readonly string[]) => void;
  readonly clearAllFilters: () => void;
}

/** Two-way bind the Explore page's whole control surface to the URL. See
 *  this module's header comment for the param-naming scheme. */
export function useExploreControls(): UseExploreControlsResult {
  const [raw, patch] = useUrlState(EXPLORE_DEFAULTS);
  const resolved = useMemo(() => resolveExploreState(raw), [raw]);

  const setX = useCallback((id: string) => patch({ x: id }), [patch]);
  const setY = useCallback((id: string) => patch({ y: id }), [patch]);
  const setColor = useCallback((id: string) => patch({ color: id }), [patch]);
  const setXScale = useCallback((scale: AxisScale) => patch({ xscale: scale }), [patch]);
  const setYScale = useCallback((scale: AxisScale) => patch({ yscale: scale }), [patch]);

  const setFilter = useCallback(
    (columnId: FrozenCategoryColumnId, values: readonly string[]) => {
      patch({ [columnId]: values });
    },
    [patch],
  );

  const clearAllFilters = useCallback(() => {
    patch({
      polymerFamily: [],
      polymer: [],
      anion: [],
      crystalline: [],
      solventUsed: [],
      doi: [],
    });
  }, [patch]);

  return { raw, resolved, setX, setY, setColor, setXScale, setYScale, setFilter, clearAllFilters };
}
