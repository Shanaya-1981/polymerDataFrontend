import { Button, Card, CardDescription, CardHeader, CardTitle } from "@/components/ui";

export interface TemperatureEmptyStateProps {
  onClearFilters: () => void;
}

/**
 * Shown in place of the plot when the active multi-select filters leave
 * zero plottable series — "say so clearly with a way back" rather than
 * rendering a blank Plotly canvas. Clearing filters is always sufficient to
 * recover: every mode has at least one non-empty series before any filter
 * is applied (368 for `T/Tg`/`VFT`, 655 for `Arrhenius`/`T`), so an empty
 * result can only come from the current filter selection.
 */
export function TemperatureEmptyState({ onClearFilters }: TemperatureEmptyStateProps) {
  return (
    <Card className="flex min-h-[420px] flex-col items-center justify-center gap-4 text-center">
      <CardHeader className="items-center">
        <CardTitle as="h2">No samples match these filters</CardTitle>
        <CardDescription>Clear a filter or two to bring series back into view.</CardDescription>
      </CardHeader>
      <Button variant="secondary" onClick={onClearFilters}>
        Clear filters
      </Button>
    </Card>
  );
}
