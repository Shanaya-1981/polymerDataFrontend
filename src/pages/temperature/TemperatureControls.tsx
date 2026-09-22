import { useId } from "react";
import { Button, Label, MultiSelect, RadioGroup } from "@/components/ui";
import { categoryOrder, COLUMN_BY_ID } from "@/data";
import type { FilterSelections } from "@/lib/filtering";
import type { TemperatureMode } from "@/lib/transforms";
import {
  isTemperatureColorColumn,
  isTemperatureMode,
  TEMPERATURE_COLOR_COLUMN_OPTIONS,
  TEMPERATURE_FILTER_COLUMN_IDS,
  TEMPERATURE_MODE_OPTIONS,
  type TemperatureColorColumn,
  type TemperatureFilterColumnId,
} from "./state";

export interface TemperatureControlsProps {
  mode: TemperatureMode;
  onModeChange: (mode: TemperatureMode) => void;
  colorColumn: TemperatureColorColumn;
  onColorColumnChange: (column: TemperatureColorColumn) => void;
  filters: FilterSelections;
  onFilterChange: (columnId: TemperatureFilterColumnId, values: readonly string[]) => void;
  onResetFilters: () => void;
  hasActiveFilters: boolean;
  /** Whether mode, color, and every filter is already at its default —
   *  mirrors `hasActiveFilters`'s own role for `onResetFilters` below. */
  isAtDefaults: boolean;
  /** Returns mode, color, and every filter to its default. */
  onReset: () => void;
}

/**
 * The Temperature page's control panel: X-axis mode, "color by" column, and
 * the 5 combinable multi-select filters (OR within a column, AND across
 * columns — `@/lib/filtering`). Fully controlled: every value and change
 * handler comes from props, so `ChartPageLayout` can safely mount this
 * component twice at once (sidebar + mobile sheet) without the two copies
 * drifting apart.
 *
 * `useId` namespaces this instance's element ids so the sidebar copy and
 * the sheet copy never collide even while both are mounted.
 */
export function TemperatureControls({
  mode,
  onModeChange,
  colorColumn,
  onColorColumnChange,
  filters,
  onFilterChange,
  onResetFilters,
  hasActiveFilters,
  isAtDefaults,
  onReset,
}: TemperatureControlsProps) {
  const uid = useId();
  const modeLabelId = `${uid}-mode-label`;
  const colorLabelId = `${uid}-color-label`;

  return (
    <div className="flex flex-col gap-8">
      {/* "Reset to defaults" (not "Clear all filters", below): this also
          resets mode and color, not just the filters — a broader action
          that needs a name distinct enough neither screen readers nor
          `getByRole` queries can confuse the two. */}
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={onReset}
        disabled={isAtDefaults}
      >
        Reset to defaults
      </Button>

      <div className="flex flex-col gap-3">
        <Label id={modeLabelId}>X axis</Label>
        <RadioGroup
          aria-labelledby={modeLabelId}
          options={TEMPERATURE_MODE_OPTIONS}
          value={mode}
          onChange={(value) => {
            if (isTemperatureMode(value)) onModeChange(value);
          }}
          className="flex-wrap"
        />
      </div>

      <div className="flex flex-col gap-3">
        <Label id={colorLabelId}>Color by</Label>
        <RadioGroup
          aria-labelledby={colorLabelId}
          options={TEMPERATURE_COLOR_COLUMN_OPTIONS}
          value={colorColumn}
          onChange={(value) => {
            if (isTemperatureColorColumn(value)) onColorColumnChange(value);
          }}
          className="flex-wrap"
        />
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-primary">Filters</h2>
          <Button variant="ghost" size="sm" onClick={onResetFilters} disabled={!hasActiveFilters}>
            Clear all filters
          </Button>
        </div>

        {TEMPERATURE_FILTER_COLUMN_IDS.map((columnId) => {
          const label = COLUMN_BY_ID[columnId].label;
          const inputId = `${uid}-filter-${columnId}`;
          return (
            <div key={columnId} className="flex flex-col gap-1.5">
              <Label htmlFor={inputId}>{label}</Label>
              <MultiSelect
                id={inputId}
                options={categoryOrder(columnId).map((value) => ({ value, label: value }))}
                values={filters[columnId] ?? []}
                onChange={(values) => onFilterChange(columnId, values)}
                placeholder="Any value"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
