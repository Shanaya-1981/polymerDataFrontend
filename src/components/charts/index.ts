export { default as Plotly } from "./plotly";
export type {
  Data as PlotlyData,
  Layout as PlotlyLayout,
  Config as PlotlyConfig,
  ColorScale as PlotlyColorScale,
  Datum as PlotlyDatum,
  MarkerSymbol as PlotlyMarkerSymbol,
  PlotMouseEvent,
  PlotDatum,
  PlotlyHTMLElement,
} from "./plotly";

export { PlotlyChart, type PlotlyChartProps, type PlotlyPointClick } from "./PlotlyChart";
export { buildBaseLayout, mergeLayout, DEFAULT_CONFIG } from "./plotly-layout";

export {
  useChartThemeMode,
  useChartThemeTokens,
  readChartThemeMode,
  readChartThemeTokens,
  type ChartThemeMode,
  type ChartThemeTokens,
} from "./theme";

export {
  buildScatterTraces,
  buildCategoricalScatterTraces,
  buildContinuousScatterTrace,
  buildTemperatureLineTraces,
  buildNullSeparatedGroups,
  buildCorrelationHeatmapTrace,
  buildImportedScatterTrace,
  resolveSlotColor,
  IMPORTED_TRACE_NAME,
  SEQUENTIAL_COLORSCALE,
  type ScatterSeriesInput,
  type ScatterTraceOptions,
  type ScatterTraceType,
  type CategoricalPoint,
  type ContinuousPoint,
  type ImportedPoint,
  type LineSample,
  type NullSeparatedGroup,
  type CorrelationMatrix,
} from "./series";
