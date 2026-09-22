/**
 * Shorten a feature name for on-axis tick display only. The hover tooltip
 * still shows the real name — `buildCorrelationHeatmapTrace`'s hovertemplate
 * reads the trace's actual x/y values (the full labels), not this
 * display-only `ticktext`.
 *
 * **Abbreviate the prefix; never truncate the tail.** These feature names
 * share long leading runs (`Comonomer1 `, `Comonomer2 `) and differ only at
 * the end, so cutting the tail destroys exactly the distinguishing part.
 * Measured over the real 36 labels, truncating at 18 characters collapsed
 * them into 27 distinct strings with four ambiguous groups — three separate
 * features all rendering as `Comonomer1 AETA_e…`, which is worse than
 * useless on an axis because it looks precise while being unreadable.
 *
 * Replacing the prefixes instead keeps all 36 distinct at 23 characters or
 * fewer, so no truncation is needed at all. The fallback below only fires
 * for a label longer than any that currently exists, and it elides the
 * middle so the tail always survives.
 *
 * Pulled out of `CorrelationHeatmap.tsx` so that component file only exports
 * a component — react-refresh requires that for fast refresh.
 */

const TICK_LABEL_MAX_CHARS = 26;

/** Long leading runs shared by many feature names, longest first. */
const PREFIX_ABBREVIATIONS: ReadonlyArray<readonly [string, string]> = [
  ["Comonomer1 ", "C1 "],
  ["Comonomer2 ", "C2 "],
];

/** Rendered near the plot so `C1` / `C2` are never a mystery. */
export const TICK_LABEL_LEGEND = "C1 = Comonomer 1, C2 = Comonomer 2";

export function formatTickLabel(label: string, maxChars = TICK_LABEL_MAX_CHARS): string {
  let short = label;
  for (const [from, to] of PREFIX_ABBREVIATIONS) {
    if (short.startsWith(from)) {
      short = to + short.slice(from.length);
      break;
    }
  }
  if (short.length <= maxChars) return short;

  // Elide the middle: the tail is what distinguishes these names.
  const tail = Math.ceil((maxChars - 1) / 2);
  const head = maxChars - 1 - tail;
  return `${short.slice(0, head)}…${short.slice(short.length - tail)}`;
}
