import { useMemo, useState } from "react";
import { ChartPageLayout } from "@/components/layout/ChartPageLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button, Card, Notice } from "@/components/ui";
import {
  buildScatterTraces,
  PlotlyChart,
  useChartThemeMode,
  type PlotlyLayout,
  type PlotlyPointClick,
} from "@/components/charts";
import { filterRows, ROW_COUNT } from "@/data";
import { useExploreControls } from "./explore/controls-state";
import { axisTitle, isCategoricalColumn } from "./explore/columns";
import { ExploreControls } from "./explore/ExploreControls";
import { PointInspector } from "./explore/PointInspector";
import {
  axisNoticeMessage,
  buildAxisNotice,
  buildExplorePoints,
  exploreEmptyReason,
  highCardinalityMessage,
  highCardinalityNotice,
} from "./explore/plot-data";

export default function Explore() {
  const { resolved, setX, setY, setColor, setXScale, setYScale, setFilter, clearAllFilters } =
    useExploreControls();
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const themeMode = useChartThemeMode();

  const filteredRowIndices = useMemo(() => filterRows(resolved.filters), [resolved.filters]);

  const { seriesInput, plottedCount } = useMemo(
    () =>
      buildExplorePoints(
        filteredRowIndices,
        resolved.x,
        resolved.xScale,
        resolved.y,
        resolved.yScale,
        resolved.color,
      ),
    [filteredRowIndices, resolved.x, resolved.xScale, resolved.y, resolved.yScale, resolved.color],
  );

  // Rebuilt whenever the theme changes: `buildScatterTraces` resolves a
  // category's rank straight to a concrete hex for the current mode, and
  // `PlotlyChart` only repaints its own chrome (axis lines, legend text) on
  // a theme change — it never sees category ranks, so it cannot repaint
  // trace colors itself.
  const traces = useMemo(() => buildScatterTraces(seriesInput, themeMode), [seriesInput, themeMode]);

  const xNotice = useMemo(
    () => buildAxisNotice(resolved.x, resolved.xScale, filteredRowIndices),
    [resolved.x, resolved.xScale, filteredRowIndices],
  );
  const yNotice = useMemo(
    () => buildAxisNotice(resolved.y, resolved.yScale, filteredRowIndices),
    [resolved.y, resolved.yScale, filteredRowIndices],
  );
  const cardinalityNotice = useMemo(() => highCardinalityNotice(resolved.color), [resolved.color]);

  const emptyReason = exploreEmptyReason(filteredRowIndices.length, plottedCount);

  const layout = useMemo<Partial<PlotlyLayout>>(() => {
    const xCategorical = isCategoricalColumn(resolved.x);
    const yCategorical = isCategoricalColumn(resolved.y);
    return {
      xaxis: {
        title: { text: axisTitle(resolved.x) },
        ...(xCategorical ? {} : { type: resolved.xScale === "log" ? "log" : "linear" }),
      },
      yaxis: {
        title: { text: axisTitle(resolved.y) },
        ...(yCategorical ? {} : { type: resolved.yScale === "log" ? "log" : "linear" }),
      },
    };
  }, [resolved.x, resolved.y, resolved.xScale, resolved.yScale]);

  function handlePointClick(point: PlotlyPointClick) {
    if (typeof point.customdata === "number") setSelectedRow(point.customdata);
  }

  return (
    <>
      <PageHeader
        title="Explore"
        description="Plot any two of the dataset's 41 measured and computed columns against each other, colored by a third. Filters combine: pick any values from multiple columns at once."
      />
      <ChartPageLayout
        controls={
          <ExploreControls
            x={resolved.x}
            xScale={resolved.xScale}
            onXChange={setX}
            onXScaleChange={setXScale}
            y={resolved.y}
            yScale={resolved.yScale}
            onYChange={setY}
            onYScaleChange={setYScale}
            color={resolved.color}
            onColorChange={setColor}
            filters={resolved.filters}
            onFilterChange={setFilter}
            onClearFilters={clearAllFilters}
            filteredRowCount={filteredRowIndices.length}
          />
        }
        summary={
          <p>
            <span className="font-medium text-primary">{filteredRowIndices.length}</span> of {ROW_COUNT}{" "}
            rows selected
          </p>
        }
        chart={
          <div className="flex flex-col gap-3">
            {xNotice ? <Notice tone="warning">{axisNoticeMessage("X", xNotice)}</Notice> : null}
            {yNotice ? <Notice tone="warning">{axisNoticeMessage("Y", yNotice)}</Notice> : null}
            {cardinalityNotice ? (
              <Notice tone="info">{highCardinalityMessage(cardinalityNotice)}</Notice>
            ) : null}

            {emptyReason ? (
              <Notice tone="info" title="Nothing to plot">
                <div className="flex flex-col gap-3">
                  <p>
                    {emptyReason === "no-rows-match-filters"
                      ? "No rows match the selected filters."
                      : `None of the ${filteredRowIndices.length} selected rows can be plotted with the current axis settings (missing values, or non-positive values on a log axis).`}
                  </p>
                  {emptyReason === "no-rows-match-filters" ? (
                    <Button variant="secondary" size="sm" className="self-start" onClick={clearAllFilters}>
                      Clear filters
                    </Button>
                  ) : null}
                </div>
              </Notice>
            ) : (
              <Card className="p-2 sm:p-4">
                <PlotlyChart
                  data={traces}
                  layout={layout}
                  onPointClick={handlePointClick}
                  ariaLabel="Scatter plot of the polymer electrolyte dataset"
                  className="h-[60vh] min-h-[420px]"
                />
              </Card>
            )}
          </div>
        }
        inspector={<PointInspector rowIndex={selectedRow} onDismiss={() => setSelectedRow(null)} />}
      />
    </>
  );
}
