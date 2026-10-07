import { Button, Card, CardContent } from "@/components/ui";
import { getRow } from "@/data";

export interface PointInspectorProps {
  /** The clicked point's source row, or `null` when nothing is selected. */
  rowIndex: number | null;
  onDismiss: () => void;
}

/**
 * The clicked sample's identity, shown below the plot in `ChartPageLayout`'s
 * `inspector` slot: the polymer name and the DOI as a real link. Renders
 * nothing until a point has been clicked, and offers a clear affordance so
 * the reader isn't stuck looking at a stale selection.
 */
export function PointInspector({ rowIndex, onDismiss }: PointInspectorProps) {
  if (rowIndex == null) return null;

  const row = getRow(rowIndex);
  const polymerName = typeof row.polymer === "string" ? row.polymer : "Unknown polymer";
  const doi = typeof row.doi === "string" ? row.doi : null;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-start sm:justify-between sm:pt-5">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Selected sample</p>
          <p className="mt-1 text-base font-semibold text-primary">{polymerName}</p>
          {doi ? (
            <a
              href={doi}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block break-all text-sm text-accent underline underline-offset-2 hover:no-underline"
            >
              {doi}
            </a>
          ) : (
            <p className="mt-1 text-sm text-secondary">No DOI recorded for this sample.</p>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={onDismiss} className="shrink-0">
          Clear selection
        </Button>
      </CardContent>
    </Card>
  );
}
