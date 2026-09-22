import { Button, Combobox, Label } from "@/components/ui";
import type { FrozenCategoryColumnId } from "@/data";
import type { FilterSelections } from "@/lib/filtering";
import type { AxisScale } from "@/lib/log-axis";
import { AxisControl } from "./AxisControl";
import { PLOTTABLE_COLUMN_OPTIONS } from "./columns";
import { FilterPanel } from "./FilterPanel";

export interface ExploreControlsProps {
  x: string;
  xScale: AxisScale;
  onXChange: (id: string) => void;
  onXScaleChange: (scale: AxisScale) => void;
  y: string;
  yScale: AxisScale;
  onYChange: (id: string) => void;
  onYScaleChange: (scale: AxisScale) => void;
  color: string;
  onColorChange: (id: string) => void;
  filters: FilterSelections;
  onFilterChange: (columnId: FrozenCategoryColumnId, values: string[]) => void;
  onClearFilters: () => void;
  filteredRowCount: number;
  /** Whether every axis, scale, color, and filter is already at its
   *  default — mirrors `onClearFilters`'s own disabled condition below. */
  isAtDefaults: boolean;
  /** Returns axes, scale, color, and every filter to its default. */
  onReset: () => void;
}

/**
 * The whole controls column — axes, color, and filters — rendered once and
 * shared between the desktop sidebar and the mobile bottom sheet by
 * `ChartPageLayout`.
 */
export function ExploreControls({
  x,
  xScale,
  onXChange,
  onXScaleChange,
  y,
  yScale,
  onYChange,
  onYScaleChange,
  color,
  onColorChange,
  filters,
  onFilterChange,
  onClearFilters,
  filteredRowCount,
  isAtDefaults,
  onReset,
}: ExploreControlsProps) {
  return (
    <div className="flex flex-col gap-6">
      {/* "Reset to defaults" (not "Clear all filters", below): this resets
          the axes, scale and color too, not just the filters — a broader
          action that needs a name distinct enough neither screen readers
          nor `getByRole` queries can confuse the two. */}
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={onReset}
        disabled={isAtDefaults}
      >
        Reset to defaults
      </Button>

      <div className="flex flex-col gap-4">
        <AxisControl
          label="X axis"
          idPrefix="explore-x"
          columnId={x}
          onColumnChange={onXChange}
          scale={xScale}
          onScaleChange={onXScaleChange}
        />
        <AxisControl
          label="Y axis"
          idPrefix="explore-y"
          columnId={y}
          onColumnChange={onYChange}
          scale={yScale}
          onScaleChange={onYScaleChange}
        />
        <div className="flex flex-col gap-2">
          <Label htmlFor="explore-color-column">Color</Label>
          <Combobox
            id="explore-color-column"
            aria-label="Color"
            options={PLOTTABLE_COLUMN_OPTIONS}
            value={color}
            onChange={onColorChange}
            placeholder="Select a column"
            searchPlaceholder="Search columns…"
          />
        </div>
      </div>

      <FilterPanel
        filters={filters}
        onChange={onFilterChange}
        onClearAll={onClearFilters}
        selectedCount={filteredRowCount}
      />
    </div>
  );
}
