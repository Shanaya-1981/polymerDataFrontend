import { RadioGroup, type RadioOption } from "@/components/ui";

export type CorrelationViewMode = "matrix" | "ranked";

export interface ViewToggleProps {
  value: CorrelationViewMode;
  onChange: (mode: CorrelationViewMode) => void;
  className?: string;
}

const OPTIONS: readonly RadioOption[] = [
  { value: "matrix", label: "Matrix" },
  { value: "ranked", label: "Ranked list" },
];

/**
 * Matrix vs. ranked-list switch. Always available at any width — the wave
 * brief is explicit that neither view should be hidden at any breakpoint,
 * only defaulted differently (see `CorrelationExplorer.tsx`).
 */
export function ViewToggle({ value, onChange, className }: ViewToggleProps) {
  return (
    <RadioGroup
      aria-label="Correlations view"
      options={OPTIONS}
      value={value}
      onChange={(next) => onChange(next === "ranked" ? "ranked" : "matrix")}
      className={className}
    />
  );
}
