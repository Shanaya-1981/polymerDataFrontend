import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { cn } from "./cn";

export interface RadioOption {
  value: string;
  label: string;
}

export interface RadioGroupProps {
  options: readonly RadioOption[];
  value: string;
  onChange: (value: string) => void;
  name?: string;
  disabled?: boolean;
  className?: string;
  /** Accessible name for the group (e.g. "X-axis scale"). Required unless
   *  the group is labelled externally via `aria-labelledby`. */
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

/**
 * Compact segmented-control radio group — e.g. the Linear/Log axis toggle.
 * Built on Radix RadioGroup for roving-tabindex keyboard nav (arrow keys
 * move the selection, Tab moves past the whole group) and correct
 * `role="radiogroup"`/`radio` semantics; styled to match `ThemeToggle`'s
 * segmented-control look for visual consistency across the app.
 */
export function RadioGroup({
  options,
  value,
  onChange,
  name,
  disabled,
  className,
  ...aria
}: RadioGroupProps) {
  return (
    <RadioGroupPrimitive.Root
      value={value}
      onValueChange={onChange}
      name={name}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border border-subtle bg-muted p-0.5",
        className,
      )}
      {...aria}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <RadioGroupPrimitive.Item
            key={option.value}
            value={option.value}
            className={cn(
              "inline-flex h-7 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors",
              "disabled:pointer-events-none disabled:opacity-50",
              active ? "bg-surface text-primary shadow-xs" : "text-secondary hover:text-primary",
            )}
          >
            {option.label}
          </RadioGroupPrimitive.Item>
        );
      })}
    </RadioGroupPrimitive.Root>
  );
}
