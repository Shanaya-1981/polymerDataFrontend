import { useMemo, useState } from "react";
import {
  buildTemperatureLineTraces,
  PlotlyChart,
  useChartThemeMode,
  type PlotlyLayout,
  type PlotlyPointClick,
} from "@/components/charts";
import { ChartPageLayout } from "@/components/layout/ChartPageLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, Notice } from "@/components/ui";
import { COLUMN_BY_ID, ROW_COUNT } from "@/data";
import { modeRequiresTg, TEMPERATURE_MODE_AXIS_TITLES } from "@/lib/transforms";
import { useTemperatureControls } from "./temperature/controls-state";
import { TemperatureEmptyState } from "./temperature/EmptyState";
import { TemperatureControls } from "./temperature/TemperatureControls";
import { TemperatureInspector } from "./temperature/TemperatureInspector";
import {
  buildInspectorData,
  buildLineSamples,
  CONDUCTIVITY_Y_AXIS_TITLE,
  countSamplePoints,
  resolveClickedPoint,
  TG_ELIGIBLE_ROW_COUNT,
  type TemperatureInspectorData,
} from "./temperature/traces";

export default function Temperature() {
  const { resolved, setMode, setColorColumn, setFilter, clearFilters, hasActiveFilters } =
    useTemperatureControls();
  const { mode, colorColumn, filters } = resolved;
  const themeMode = useChartThemeMode();
  const [selected, setSelected] = useState<TemperatureInspectorData | null>(null);

  const samples = useMemo(
    () => buildLineSamples(mode, colorColumn, filters),
    [mode, colorColumn, filters],
  );

  // Rebuilt whenever the theme changes: `buildTemperatureLineTraces`
  // resolves a category's rank straight to a concrete hex for the current
  // mode, and `PlotlyChart` only repaints its own chrome (axis lines,
  // legend text) on a theme change — it never sees category ranks, so it
  // cannot repaint trace colors itself.
  const traces = useMemo(() => buildTemperatureLineTraces(samples, themeMode), [samples, themeMode]);
  const pointCount = useMemo(() => countSamplePoints(samples), [samples]);

  const layout = useMemo<Partial<PlotlyLayout>>(
    () => ({
      xaxis: { title: { text: TEMPERATURE_MODE_AXIS_TITLES[mode] } },
      yaxis: { type: "log", title: { text: CONDUCTIVITY_Y_AXIS_TITLE } },
    }),
    [mode],
  );

  function handlePointClick(point: PlotlyPointClick) {
    const clicked = resolveClickedPoint(mode, point.customdata, point.x, point.y);
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
          </span>
        }
        controls={
          <TemperatureControls
            mode={mode}
            onModeChange={setMode}
            colorColumn={colorColumn}
            onColorColumnChange={setColorColumn}
            filters={filters}
            onFilterChange={setFilter}
            onResetFilters={clearFilters}
            hasActiveFilters={hasActiveFilters}
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

            {samples.length === 0 ? (
              <TemperatureEmptyState onClearFilters={clearFilters} />
            ) : (
              <Card className="p-2 sm:p-4">
                <PlotlyChart
                  data={traces}
                  layout={layout}
                  onPointClick={handlePointClick}
                  ariaLabel={`Conductivity versus ${mode} plot, colored by ${colorLabel}, showing ${samples.length} series`}
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
