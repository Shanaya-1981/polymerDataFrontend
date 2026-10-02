import { toCsv } from "@/lib/csv-export";
import type { ExtractedValue, Samples } from "./api";

/**
 * The feature names in what the user typed, split the way `POST /extract`
 * splits them: at commas, trimmed, blanks dropped. So the page counts and
 * shows exactly the names the server will use.
 */
export function parseFeatureNames(text: string): string[] {
  return text
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name !== "");
}

/** Shown for a value the paper doesn't give. */
export const MISSING_VALUE_TEXT = "—";

/**
 * A value as the results table shows it. Unlike the Data page's
 * `formatNumber`, this never rounds: an extracted number is something to
 * check against the paper, and there's no export here keeping the full
 * figure. Very small or large magnitudes switch to the same `2.82e-7`
 * notation the Data page uses, with every digit the server sent.
 */
export function formatExtractedValue(value: ExtractedValue): string {
  if (value === null) return MISSING_VALUE_TEXT;
  if (typeof value === "string") return value;
  const magnitude = Math.abs(value);
  if (magnitude !== 0 && (magnitude < 1e-3 || magnitude >= 1e6)) {
    return value.toExponential().replace("e+", "e");
  }
  return String(value);
}

/**
 * The table's columns: every feature in the results, in the order the
 * server first lists them. The server gives every point every feature, in
 * the order they were asked for; taking the union is only a guard against
 * a point that doesn't.
 */
export function tableColumns(samples: Samples): string[] {
  const columns = new Set<string>();
  for (const points of Object.values(samples)) {
    for (const point of points) for (const feature of Object.keys(point)) columns.add(feature);
  }
  return [...columns];
}

/**
 * The results as a CSV file: one row per data point, the sample's name in a
 * first column called `sample`, then one column per feature — the layout
 * `extract_features.py` writes from the command line. A value the paper
 * doesn't give is an empty cell, and numbers keep every digit the server sent.
 */
export function extractionCsv(samples: Samples): string {
  const columns = tableColumns(samples);
  const rows = Object.entries(samples).flatMap(([name, points]) =>
    points.map((point) => [name, ...columns.map((column) => point[column] ?? null)]),
  );
  return toCsv(["sample", ...columns], rows);
}

/** `"linden1988.pdf"` → `"linden1988-extracted.csv"`. */
export function extractionCsvName(pdfName: string): string {
  return `${pdfName.replace(/\.pdf$/i, "") || "paper"}-extracted.csv`;
}

/** Whether a column holds only numbers (and gaps), so it can align right. */
export function isNumericColumn(samples: Samples, column: string): boolean {
  let sawNumber = false;
  for (const points of Object.values(samples)) {
    for (const point of points) {
      const value = point[column];
      if (typeof value === "string") return false;
      if (typeof value === "number") sawNumber = true;
    }
  }
  return sawNumber;
}

export function countPoints(samples: Samples): number {
  return Object.values(samples).reduce((sum, points) => sum + points.length, 0);
}

/** `1_234_567` → `"1.2 MB"`: enough to tell which file was picked. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** `83_000` → `"1:23"`: minutes, then zero-padded seconds. */
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
