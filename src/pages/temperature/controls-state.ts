import { useCallback, useMemo } from "react";
import type { FilterSelections } from "@/lib/filtering";
import type { TemperatureMode } from "@/lib/transforms";
import { useUrlState } from "@/lib/url-state";
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
}

type FilterPatch = Partial<Record<TemperatureFilterColumnId, readonly string[]>>;

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
  const [urlState, patchUrlState] = useUrlState({
    mode: DEFAULT_TEMPERATURE_MODE as string,
    color: DEFAULT_TEMPERATURE_COLOR_COLUMN as string,
    doi: [] as readonly string[],
    polymerFamily: [] as readonly string[],
    anion: [] as readonly string[],
    crystalline: [] as readonly string[],
    solventUsed: [] as readonly string[],
  });

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

  const hasActiveFilters = TEMPERATURE_FILTER_COLUMN_IDS.some((id) => filters[id].length > 0);

  return {
    resolved: { mode, colorColumn, filters },
    setMode,
    setColorColumn,
    setFilter,
    clearFilters,
    hasActiveFilters,
  };
}
