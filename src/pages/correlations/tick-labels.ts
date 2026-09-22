const TICK_LABEL_MAX_CHARS = 18;

/**
 * Shorten a long feature name for on-axis tick display only. The real name
 * is still what the hover tooltip shows — `buildCorrelationHeatmapTrace`'s
 * hovertemplate reads the trace's actual x/y values (the full labels), not
 * this display-only `ticktext`.
 *
 * Pulled out of `CorrelationHeatmap.tsx` (rather than defined inline) so
 * that component file only exports a component — react-refresh requires
 * that for fast refresh to work.
 */
export function truncateTickLabel(label: string, maxChars = TICK_LABEL_MAX_CHARS): string {
  return label.length > maxChars ? `${label.slice(0, maxChars - 1)}…` : label;
}
