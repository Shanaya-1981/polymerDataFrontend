import { Combobox, Label } from "@/components/ui";
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
}: ExploreControlsProps) {
  return (
    <div className="flex flex-col gap-6">
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
