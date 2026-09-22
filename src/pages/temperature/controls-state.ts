import { useCallback, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { clearRememberedRoute } from "@/lib/route-memory";
import type { FilterSelections } from "@/lib/filtering";
import type { TemperatureMode } from "@/lib/transforms";
import { useUrlState, type UrlStateValue } from "@/lib/url-state";
import {
  DEFAULT_TEMPERATURE_COLOR_COLUMN,
  DEFAULT_TEMPERATURE_MODE,
  isTemperatureColorColumn,
  isTemperatureMode,
  TEMPERATURE_FILTER_COLUMN_IDS,
  type TemperatureColorColumn,
  type TemperatureFilterColumnId,
} from "./state";

export interface ResolvedTemperatureControls {
  mode: TemperatureMode;
  colorColumn: TemperatureColorColumn;
  filters: FilterSelections;
}

export interface TemperatureControlsState {
  resolved: ResolvedTemperatureControls;
  setMode: (mode: TemperatureMode) => void;
  setColorColumn: (column: TemperatureColorColumn) => void;
  setFilter: (columnId: TemperatureFilterColumnId, values: readonly string[]) => void;
  clearFilters: () => void;
  hasActiveFilters: boolean;
  /**
   * True when the URL carries no non-default state at all. `useUrlState`
   * already omits every key equal to its default, so a page sitting at its
   * defaults always has a bare query string — checking the whole search
   * string this way can't drift from that contract.
   */
  isAtDefaults: boolean;
  /**
   * Resets mode, color, and every filter to its default in one call, and
   * forgets this route's remembered search (`@/lib/route-memory`), so the
   * next nav click back to `/temperature` doesn't bring the old state back.
   */
  resetToDefaults: () => void;
}

type FilterPatch = Partial<Record<TemperatureFilterColumnId, readonly string[]>>;

// `useUrlState`'s `T extends UrlState` constraint is checked structurally
// against an index signature, which a plain object type doesn't have by
// default — same reason `explore/controls-state.ts`'s `ExploreUrlState` and
// `data/table-state.ts`'s `DataTableUrlState` declare one explicitly. Named
// (rather than the inline literal this used to be) so `resetToDefaults`
// below can hand the exact same defaults back to `patchUrlState`.
interface TemperatureUrlState {
  [key: string]: UrlStateValue;
  mode: string;
  color: string;
  doi: readonly string[];
  polymerFamily: readonly string[];
  anion: readonly string[];
  crystalline: readonly string[];
  solventUsed: readonly string[];
}

const TEMPERATURE_URL_DEFAULTS: TemperatureUrlState = {
  mode: DEFAULT_TEMPERATURE_MODE,
  color: DEFAULT_TEMPERATURE_COLOR_COLUMN,
  doi: [],
  polymerFamily: [],
  anion: [],
  crystalline: [],
  solventUsed: [],
};

/**
 * URL-backed state for the Temperature page's controls: X-axis mode, "color
 * by" column, and the 5 combinable multi-select filters — mirrors the
 * sibling Explore page's `useExploreControls` shape (`resolved` + setters)
 * so both chart pages read the same way.
 *
 * `useUrlState` (`@/lib/url-state`) only fills in a default for an *absent*
 * URL param — it does not validate against a union — so `mode`/`color` are
 * re-checked with `isTemperatureMode`/`isTemperatureColorColumn` before use,
 * falling back to the default rather than trusting a hand-edited URL like
 * `?mode=bogus`.
 */
export function useTemperatureControls(): TemperatureControlsState {
  const [urlState, patchUrlState] = useUrlState(TEMPERATURE_URL_DEFAULTS);
  const location = useLocation();

  const mode: TemperatureMode = isTemperatureMode(urlState.mode)
    ? urlState.mode
    : DEFAULT_TEMPERATURE_MODE;
  const colorColumn: TemperatureColorColumn = isTemperatureColorColumn(urlState.color)
    ? urlState.color
    : DEFAULT_TEMPERATURE_COLOR_COLUMN;

  const filters: FilterSelections = useMemo(
    () => ({
      doi: urlState.doi,
      polymerFamily: urlState.polymerFamily,
      anion: urlState.anion,
      crystalline: urlState.crystalline,
      solventUsed: urlState.solventUsed,
    }),
    [
      urlState.doi,
      urlState.polymerFamily,
      urlState.anion,
      urlState.crystalline,
      urlState.solventUsed,
    ],
  );

  const setMode = useCallback(
    (next: TemperatureMode) => patchUrlState({ mode: next }),
    [patchUrlState],
  );
  const setColorColumn = useCallback(
    (next: TemperatureColorColumn) => patchUrlState({ color: next }),
    [patchUrlState],
  );
  const setFilter = useCallback(
    (columnId: TemperatureFilterColumnId, values: readonly string[]) => {
      const patch: FilterPatch = {};
      patch[columnId] = values;
      patchUrlState(patch);
    },
    [patchUrlState],
  );
  const clearFilters = useCallback(() => {
    const patch: FilterPatch = {};
    for (const id of TEMPERATURE_FILTER_COLUMN_IDS) patch[id] = [];
    patchUrlState(patch);
  }, [patchUrlState]);

  const resetToDefaults = useCallback(() => {
    patchUrlState(TEMPERATURE_URL_DEFAULTS);
    clearRememberedRoute(location.pathname);
  }, [patchUrlState, location.pathname]);

  const hasActiveFilters = TEMPERATURE_FILTER_COLUMN_IDS.some((id) => filters[id].length > 0);

  return {
    resolved: { mode, colorColumn, filters },
    setMode,
    setColorColumn,
    setFilter,
    clearFilters,
    hasActiveFilters,
    isAtDefaults: location.search === "",
    resetToDefaults,
  };
}
