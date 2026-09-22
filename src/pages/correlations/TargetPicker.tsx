import { useId, useMemo } from "react";
import { Combobox, Label } from "@/components/ui";
import { buildTargetOptions, targetFromValue, targetToValue, type CorrelationTarget } from "./targets";

export interface TargetPickerProps {
  value: CorrelationTarget;
  onChange: (target: CorrelationTarget) => void;
  className?: string;
}

/**
 * The ranked view's target picker: 22 conductivity temperatures plus 36
 * glossary features in one searchable list (`Combobox`'s free-text
 * filtering makes a flat 58-option list easier to reach than two separate
 * dropdowns would be). `buildTargetOptions` is static per build, so it's
 * computed once at module scope rather than on every render.
 */
const OPTIONS = buildTargetOptions();

export function TargetPicker({ value, onChange, className }: TargetPickerProps) {
  const id = useId();
  const selectedValue = useMemo(() => targetToValue(value), [value]);

  return (
    <div className={className}>
      <Label htmlFor={id}>Rank against</Label>
      <div className="mt-1.5">
        <Combobox
          id={id}
          aria-label="Rank against"
          options={OPTIONS}
          value={selectedValue}
          onChange={(next) => {
            const parsed = targetFromValue(next);
            if (parsed) onChange(parsed);
          }}
          placeholder="Choose a temperature or feature…"
          searchPlaceholder="Search temperatures or features…"
          className="sm:w-80"
        />
      </div>
    </div>
  );
}
