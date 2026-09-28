import { type ReactNode, useState } from "react";
import { Button, Sheet, SheetContent, SheetTrigger } from "@/components/ui";

export interface ChartPageLayoutProps {
  /** The control panel: axis pickers, filters, scale toggles. */
  controls: ReactNode;
  /** The plot itself. */
  chart: ReactNode;
  /**
   * Click-to-inspect details, rendered under the chart on every breakpoint.
   * Both chart pages show the selected sample here rather than in the
   * control column, so the plot and its readout stay visually adjacent.
   */
  inspector?: ReactNode;
  /** Shown above the plot on small screens next to the Controls button. */
  summary?: ReactNode;
}

/**
 * Shared frame for the two chart pages, so `/explore` and `/temperature`
 * cannot drift apart visually.
 *
 * The original site hard-coded a Bootstrap `width=4` control column beside a
 * `width=8` plot with a fixed pixel figure size, which made it unusable on a
 * phone. Here the same two-column reading order survives on wide screens —
 * controls left, plot right, controls sticky so they stay reachable while
 * the plot scrolls — but below `lg` the controls move into a bottom sheet.
 *
 * A bottom sheet specifically (rather than a side drawer or an accordion):
 * adjusting an axis is a tight feedback loop, and a bottom sheet leaves the
 * top of the plot visible so you can see the result without dismissing it.
 */
export function ChartPageLayout({ controls, chart, inspector, summary }: ChartPageLayoutProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      {/* Small screens: controls live behind this button. */}
      <div className="flex items-center gap-3 lg:hidden">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button variant="secondary" size="sm">
              Controls
            </Button>
          </SheetTrigger>
          <SheetContent
            side="bottom"
            title="Plot controls"
            description="Choose what to plot and filter the dataset."
          >
            <div className="max-h-[70vh] overflow-y-auto pr-1">{controls}</div>
          </SheetContent>
        </Sheet>
        {summary ? <div className="min-w-0 text-sm text-secondary">{summary}</div> : null}
      </div>

      <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
        <aside className="hidden w-full shrink-0 lg:sticky lg:top-24 lg:block lg:w-80 xl:w-88">
          {controls}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-6">
          {chart}
          {inspector}
        </div>
      </div>
    </div>
  );
}
