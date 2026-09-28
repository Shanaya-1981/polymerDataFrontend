import { useMemo, useState } from "react";
import { ChartPageLayout } from "@/components/layout/ChartPageLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button, Card, Notice } from "@/components/ui";
import {
  buildImportedScatterTraces,
  buildScatterTraces,
  hasImportedLegend,
  IMPORTED_LEGEND_LAYOUT,
  PlotlyChart,
  useChartThemeMode,
  type PlotlyLayout,
  type PlotlyPointClick,
} from "@/components/charts";
import { groupImportedByCategory } from "@/components/import";
import { useImportedData } from "@/contexts";
import { filterRows, ROW_COUNT } from "@/data";
import { useExploreControls } from "./explore/controls-state";
import { axisTitle, columnLabel, isCategoricalColumn } from "./explore/columns";
import { ExploreControls } from "./explore/ExploreControls";
import { PointInspector } from "./explore/PointInspector";
import {
  axisNoticeMessage,
  buildAxisNotice,
  buildExplorePoints,
  buildImportedPoints,
  exploreEmptyReason,
  highCardinalityMessage,
  highCardinalityNotice,
  importedNoticeMessage,
} from "./explore/plot-data";

export default function Explore() {
  const {
    resolved,
    setX,
    setY,
    setColor,
    setXScale,
    setYScale,
    setFilter,
    clearAllFilters,
    isAtDefaults,
    resetToDefaults,
  } = useExploreControls();
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  // Held above the router (see ImportedDataProvider) so it survives page
  // switches; never written to storage or the URL, so refresh clears it.
  const { imported } = useImportedData();
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

  const importedPoints = useMemo(
    () =>
      imported
        ? buildImportedPoints(
            imported,
            resolved.x,
            resolved.xScale,
            resolved.y,
            resolved.yScale,
            resolved.color,
          )
        : null,
    [imported, resolved.x, resolved.xScale, resolved.y, resolved.yScale, resolved.color],
  );
  const hasOverlay = importedPoints != null && importedPoints.points.length > 0;
  // One legend entry per formulation when coloring by a category, like the
  // dataset's own; a numeric color column leaves nothing to split by.
  const importedGroups = useMemo(() => {
    if (!importedPoints || importedPoints.points.length === 0) return [];
    return isCategoricalColumn(resolved.color)
      ? groupImportedByCategory(importedPoints.points, resolved.color, (p) => p.colorValue)
      : [{ label: null, items: importedPoints.points }];
  }, [importedPoints, resolved.color]);
  const separateImportedLegend = hasImportedLegend(importedGroups);
  const importedNotice = importedPoints
    ? importedNoticeMessage(importedPoints, resolved.x, resolved.y)
    : null;

  // Rebuilt whenever the theme changes: `buildScatterTraces` resolves a
  // category's rank straight to a concrete hex for the current mode, and
  // `PlotlyChart` only repaints its own chrome (axis lines, legend text) on
  // a theme change — it never sees category ranks, so it cannot repaint
  // trace colors itself. The overlay goes last so it draws on top.
  const traces = useMemo(
    () => [
      ...buildScatterTraces(seriesInput, themeMode, {
        continuousName: hasOverlay ? "Dataset" : undefined,
      }),
      ...buildImportedScatterTraces(importedGroups, themeMode, {
        colorLabel: columnLabel(resolved.color),
      }),
    ],
    [seriesInput, themeMode, hasOverlay, importedGroups, resolved.color],
  );

  const xNotice = useMemo(
    () => buildAxisNotice(resolved.x, resolved.xScale, filteredRowIndices),
    [resolved.x, resolved.xScale, filteredRowIndices],
  );
  const yNotice = useMemo(
    () => buildAxisNotice(resolved.y, resolved.yScale, filteredRowIndices),
    [resolved.y, resolved.yScale, filteredRowIndices],
  );
  const cardinalityNotice = useMemo(() => highCardinalityNotice(resolved.color), [resolved.color]);

  // Why no dataset point is on the chart, if none is. Imported points
  // alone are still worth a chart, so with an overlay this becomes a
  // notice above it instead of replacing it.
  const emptyReason = exploreEmptyReason(filteredRowIndices.length, plottedCount);
  const continuousWithOverlay = hasOverlay && seriesInput.kind === "continuous";

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
      // A continuous color column puts its colorbar where the legend would
      // go, so the two-entry Dataset/Imported legend moves above the plot.
      ...(continuousWithOverlay
        ? {
            legend: { orientation: "h", x: 0, xanchor: "left", y: 1.02, yanchor: "bottom" },
            margin: { t: 48 },
          }
        : {}),
      // Never together with the branch above: a numeric color column leaves
      // imported rows nothing to split by, so they stay in the main legend.
      ...(separateImportedLegend ? IMPORTED_LEGEND_LAYOUT : {}),
    };
  }, [
    resolved.x,
    resolved.y,
    resolved.xScale,
    resolved.yScale,
    continuousWithOverlay,
    separateImportedLegend,
  ]);

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
            isAtDefaults={isAtDefaults}
            onReset={resetToDefaults}
          />
        }
        summary={
          <p>
            <span className="font-medium text-primary">{filteredRowIndices.length}</span> of{" "}
            {ROW_COUNT} rows selected
          </p>
        }
        chart={
          <div className="flex flex-col gap-3">
            {xNotice ? <Notice tone="warning">{axisNoticeMessage("X", xNotice)}</Notice> : null}
            {yNotice ? <Notice tone="warning">{axisNoticeMessage("Y", yNotice)}</Notice> : null}
            {cardinalityNotice ? (
              <Notice tone="info">{highCardinalityMessage(cardinalityNotice)}</Notice>
            ) : null}
            {importedNotice ? <Notice tone="info">{importedNotice}</Notice> : null}

            {emptyReason ? (
              <Notice
                tone="info"
                title={hasOverlay ? "Only your imported data is shown" : "Nothing to plot"}
              >
                <div className="flex flex-col gap-3">
                  <p>
                    {emptyReason === "no-rows-match-filters"
                      ? "No rows match the selected filters."
                      : `None of the ${filteredRowIndices.length} selected rows can be plotted with the current axis settings (missing values, or non-positive values on a log axis).`}
                  </p>
                  {emptyReason === "no-rows-match-filters" ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="self-start"
                      onClick={clearAllFilters}
                    >
                      Clear filters
                    </Button>
                  ) : null}
                </div>
              </Notice>
            ) : null}
            {!emptyReason || hasOverlay ? (
              <Card className="p-2 sm:p-4">
                <PlotlyChart
                  data={traces}
                  layout={layout}
                  onPointClick={handlePointClick}
                  ariaLabel="Scatter plot of the polymer electrolyte dataset"
                  className="h-[60vh] min-h-[420px]"
                />
              </Card>
            ) : null}
          </div>
        }
        inspector={<PointInspector rowIndex={selectedRow} onDismiss={() => setSelectedRow(null)} />}
      />
    </>
  );
}
