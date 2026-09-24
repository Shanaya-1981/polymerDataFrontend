import { useMemo, useState } from "react";
import {
  buildImportedLineTraces,
  buildTemperatureLineTraces,
  hasImportedLegend,
  IMPORTED_LEGEND_LAYOUT,
  PlotlyChart,
  useChartThemeMode,
  type PlotlyLayout,
  type PlotlyPointClick,
} from "@/components/charts";
import { groupImportedByCategory } from "@/components/import";
import { ChartPageLayout } from "@/components/layout/ChartPageLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button, Card, Notice } from "@/components/ui";
import { useImportedData } from "@/contexts";
import { COLUMN_BY_ID, ROW_COUNT } from "@/data";
import { modeRequiresTg, TEMPERATURE_MODE_AXIS_TITLES } from "@/lib/transforms";
import { useTemperatureControls } from "./temperature/controls-state";
import { TemperatureEmptyState } from "./temperature/EmptyState";
import { TemperatureControls } from "./temperature/TemperatureControls";
import { TemperatureInspector } from "./temperature/TemperatureInspector";
import {
  buildImportedLineSamples,
  buildInspectorData,
  buildLineSamples,
  countSamplePoints,
  importedTemperatureNotice,
  resolveClickedPoint,
  TEMPERATURE_Y_AXIS_TITLES,
  TG_ELIGIBLE_ROW_COUNT,
  type TemperatureInspectorData,
} from "./temperature/traces";

export default function Temperature() {
  const {
    resolved,
    setMode,
    setYAxis,
    setColorColumn,
    setFilter,
    clearFilters,
    hasActiveFilters,
    isAtDefaults,
    resetToDefaults,
  } = useTemperatureControls();
  const { mode, yAxis, colorColumn, filters } = resolved;
  const themeMode = useChartThemeMode();
  const [selected, setSelected] = useState<TemperatureInspectorData | null>(null);
  // The same session-only CSV overlay the Explore page shows.
  const { imported } = useImportedData();

  const samples = useMemo(
    () => buildLineSamples(mode, colorColumn, filters, yAxis),
    [mode, colorColumn, filters, yAxis],
  );
  const importedResult = useMemo(
    () => (imported ? buildImportedLineSamples(imported, mode, colorColumn, yAxis) : null),
    [imported, mode, colorColumn, yAxis],
  );
  // One legend entry per formulation, like the dataset's own.
  const importedGroups = useMemo(
    () =>
      importedResult
        ? groupImportedByCategory(importedResult.samples, colorColumn, (s) => s.colorValue)
        : [],
    [importedResult, colorColumn],
  );
  const separateImportedLegend = hasImportedLegend(importedGroups);
  const importedCount = importedResult?.samples.length ?? 0;
  const importedNotice = importedResult
    ? importedTemperatureNotice(importedResult, mode, yAxis)
    : null;

  // Rebuilt whenever the theme changes: `buildTemperatureLineTraces`
  // resolves a category's rank straight to a concrete hex for the current
  // mode, and `PlotlyChart` only repaints its own chrome (axis lines,
  // legend text) on a theme change — it never sees category ranks, so it
  // cannot repaint trace colors itself. The overlay goes last so it draws
  // on top.
  const traces = useMemo(
    () => [
      ...buildTemperatureLineTraces(samples, themeMode),
      ...buildImportedLineTraces(importedGroups, themeMode, {
        colorLabel: COLUMN_BY_ID[colorColumn].label,
      }),
    ],
    [samples, themeMode, importedGroups, colorColumn],
  );
  const pointCount = useMemo(() => countSamplePoints(samples), [samples]);

  const layout = useMemo<Partial<PlotlyLayout>>(
    () => ({
      xaxis: { title: { text: TEMPERATURE_MODE_AXIS_TITLES[mode] } },
      // log σ is already logarithmic, so it goes on a linear axis.
      yaxis: {
        type: yAxis === "logSigma" ? "linear" : "log",
        title: { text: TEMPERATURE_Y_AXIS_TITLES[yAxis] },
      },
      ...(separateImportedLegend ? IMPORTED_LEGEND_LAYOUT : {}),
    }),
    [mode, yAxis, separateImportedLegend],
  );

  function handlePointClick(point: PlotlyPointClick) {
    const clicked = resolveClickedPoint(mode, point.customdata, point.x, point.y, yAxis);
    if (clicked) setSelected(buildInspectorData(clicked));
  }

  const colorLabel = COLUMN_BY_ID[colorColumn].label;
  const missingForTg = ROW_COUNT - TG_ELIGIBLE_ROW_COUNT;

  return (
    <>
      <PageHeader
        title="Temperature"
        description="Conductivity as a function of temperature — Arrhenius, VFT, and T/Tg views of the same measurements."
      />

      <ChartPageLayout
        summary={
          <span>
            {samples.length.toLocaleString()} series &middot; {pointCount.toLocaleString()} points
            {importedCount > 0 ? <> &middot; {importedCount} imported</> : null}
          </span>
        }
        controls={
          <TemperatureControls
            mode={mode}
            onModeChange={setMode}
            yAxis={yAxis}
            onYAxisChange={setYAxis}
            colorColumn={colorColumn}
            onColorColumnChange={setColorColumn}
            filters={filters}
            onFilterChange={setFilter}
            onResetFilters={clearFilters}
            hasActiveFilters={hasActiveFilters}
            isAtDefaults={isAtDefaults}
            onReset={resetToDefaults}
          />
        }
        chart={
          <div className="flex flex-col gap-4">
            {modeRequiresTg(mode) ? (
              <Notice tone="info" title="Fewer samples in this view">
                {mode} needs a measured glass-transition temperature (Tg), so it plots{" "}
                {TG_ELIGIBLE_ROW_COUNT} of {ROW_COUNT} samples &mdash; {missingForTg} fewer than
                Arrhenius or T.
              </Notice>
            ) : null}
            {importedNotice ? <Notice tone="info">{importedNotice}</Notice> : null}

            {/* Filters never hide imported curves, and those alone are still
                worth a chart — so with an overlay, an empty dataset is a
                notice above it rather than the full empty state. */}
            {samples.length === 0 && importedCount > 0 ? (
              <Notice tone="info" title="Only your imported data is shown">
                <div className="flex flex-col gap-3">
                  <p>No samples match these filters.</p>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="self-start"
                    onClick={clearFilters}
                  >
                    Clear filters
                  </Button>
                </div>
              </Notice>
            ) : null}
            {samples.length === 0 && importedCount === 0 ? (
              <TemperatureEmptyState onClearFilters={clearFilters} />
            ) : (
              <Card className="p-2 sm:p-4">
                <PlotlyChart
                  data={traces}
                  layout={layout}
                  onPointClick={handlePointClick}
                  ariaLabel={`${yAxis === "logSigma" ? "Log conductivity" : "Conductivity"} versus ${mode} plot, colored by ${colorLabel}, showing ${samples.length} series${importedCount > 0 ? ` plus ${importedCount} imported` : ""}`}
                  className="h-[60vh] min-h-[420px]"
                />
              </Card>
            )}
          </div>
        }
        inspector={<TemperatureInspector selected={selected} />}
      />
    </>
  );
}
