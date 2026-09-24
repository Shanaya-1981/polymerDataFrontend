import { useId } from "react";
import { ImportButtons, ImportStatus } from "@/components/import";
import { Button, Label, MultiSelect, RadioGroup } from "@/components/ui";
import { categoryOrder, COLUMN_BY_ID } from "@/data";
import type { FilterSelections } from "@/lib/filtering";
import type { TemperatureMode } from "@/lib/transforms";
import {
  isTemperatureColorColumn,
  isTemperatureMode,
  isTemperatureYAxis,
  TEMPERATURE_COLOR_COLUMN_OPTIONS,
  TEMPERATURE_FILTER_COLUMN_IDS,
  TEMPERATURE_MODE_OPTIONS,
  TEMPERATURE_Y_AXIS_OPTIONS,
  type TemperatureColorColumn,
  type TemperatureFilterColumnId,
  type TemperatureYAxis,
} from "./state";

export interface TemperatureControlsProps {
  mode: TemperatureMode;
  onModeChange: (mode: TemperatureMode) => void;
  yAxis: TemperatureYAxis;
  onYAxisChange: (yAxis: TemperatureYAxis) => void;
  colorColumn: TemperatureColorColumn;
  onColorColumnChange: (column: TemperatureColorColumn) => void;
  filters: FilterSelections;
  onFilterChange: (columnId: TemperatureFilterColumnId, values: readonly string[]) => void;
  onResetFilters: () => void;
  hasActiveFilters: boolean;
  /** Whether mode, y-axis, color, and every filter is already at its
   *  default — mirrors `hasActiveFilters`'s own role for `onResetFilters`. */
  isAtDefaults: boolean;
  /** Returns mode, y-axis, color, and every filter to its default. */
  onReset: () => void;
}

/**
 * The Temperature page's control panel: X-axis mode, y-axis, "color by" column, and
 * the 5 combinable multi-select filters (OR within a column, AND across
 * columns — `@/lib/filtering`). Fully controlled: every value and change
 * handler comes from props (the CSV import controls read the shared
 * imported-data context instead, which is just as safe), so
 * `ChartPageLayout` can mount this component twice at once (sidebar +
 * mobile sheet) without the two copies drifting apart.
 *
 * `useId` namespaces this instance's element ids so the sidebar copy and
 * the sheet copy never collide even while both are mounted.
 */
export function TemperatureControls({
  mode,
  onModeChange,
  yAxis,
  onYAxisChange,
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
  const yAxisLabelId = `${uid}-y-axis-label`;
  const colorLabelId = `${uid}-color-label`;

  return (
    <div className="flex flex-col gap-8">
      {/* "Reset to defaults" (not "Clear all filters", below): this also
          resets mode and color, not just the filters — a broader action
          that needs a name distinct enough neither screen readers nor
          `getByRole` queries can confuse the two. It leaves an imported CSV
          alone, which has its own "Clear imported data" button. */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onReset} disabled={isAtDefaults}>
            Reset to defaults
          </Button>
          <ImportButtons />
        </div>
        <ImportStatus />
      </div>

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
        <Label id={yAxisLabelId}>Y axis</Label>
        <RadioGroup
          aria-labelledby={yAxisLabelId}
          options={TEMPERATURE_Y_AXIS_OPTIONS}
          value={yAxis}
          onChange={(value) => {
            if (isTemperatureYAxis(value)) onYAxisChange(value);
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
