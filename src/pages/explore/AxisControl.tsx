import { Combobox, Label, RadioGroup, type RadioOption } from "@/components/ui";
import type { AxisScale } from "@/lib/log-axis";
import { isCategoricalColumn, PLOTTABLE_COLUMN_OPTIONS } from "./columns";

const SCALE_OPTIONS: readonly RadioOption[] = [
  { value: "linear", label: "Linear" },
  { value: "log", label: "Log" },
];

export interface AxisControlProps {
  /** Visible label and the base for every control's accessible name, e.g.
   *  "X axis" / "Y axis". */
  label: string;
  /** Prefix for this instance's element ids, so X and Y never collide. */
  idPrefix: string;
  columnId: string;
  onColumnChange: (id: string) => void;
  scale: AxisScale;
  onScaleChange: (scale: AxisScale) => void;
}

/**
 * One axis's column picker plus its independent Linear/Log toggle. Shared
 * between X and Y so the two can never drift out of sync in behavior.
 *
 * Log has no meaning for a categorical axis (there is no such thing as the
 * log of a category label), so the scale toggle disables itself — rather
 * than silently ignoring "Log" — whenever the selected column is
 * categorical. The underlying stored preference is left alone: switching
 * back to a continuous column restores whatever scale was chosen before.
 */
export function AxisControl({
  label,
  idPrefix,
  columnId,
  onColumnChange,
  scale,
  onScaleChange,
}: AxisControlProps) {
  const scaleDisabled = isCategoricalColumn(columnId);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={`${idPrefix}-column`}>{label}</Label>
        <RadioGroup
          aria-label={`${label} scale`}
          options={SCALE_OPTIONS}
          value={scaleDisabled ? "linear" : scale}
          onChange={(value) => onScaleChange(value === "log" ? "log" : "linear")}
          disabled={scaleDisabled}
        />
      </div>
      <Combobox
        id={`${idPrefix}-column`}
        aria-label={label}
        options={PLOTTABLE_COLUMN_OPTIONS}
        value={columnId}
        onChange={onColumnChange}
        placeholder="Select a column"
        searchPlaceholder="Search columns…"
      />
      {scaleDisabled ? (
        <p className="text-xs text-muted">Log scale isn&apos;t available for a categorical column.</p>
      ) : null}
    </div>
  );
}
