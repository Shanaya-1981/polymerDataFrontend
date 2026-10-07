import { toCsv } from "@/lib/csv-export";
import type { DiscoveredPaper } from "./api";

/** One paper per line, blanks dropped: the seeds the server gets. */
export function parseSeeds(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

/** "A, B, C et al." — enough to recognise a paper. */
export function formatAuthors(authors: readonly string[]): string {
  if (authors.length === 0) return "Authors unknown";
  if (authors.length <= 3) return authors.join(", ");
  return `${authors.slice(0, 3).join(", ")} et al.`;
}

/**
 * Text from OpenAlex or the model, made safe to open in a spreadsheet: a
 * cell starting with `=`, `+`, `-`, `@`, a tab or a carriage return would
 * run as a formula in Excel or Calc (CSV injection), so it gets a leading
 * `'`. Kept here rather than in `toCsv`, which also writes extracted values,
 * where a leading `-` is a negative number.
 */
export function spreadsheetSafe(text: string | null): string | null {
  return text !== null && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

export function papersCsv(papers: readonly DiscoveredPaper[]): string {
  return toCsv(
    ["title", "authors", "year", "journal", "doi", "pdf", "score", "reason", "description"],
    papers.map((p) => [
      spreadsheetSafe(p.title),
      spreadsheetSafe(p.authors.join("; ")),
      p.year,
      spreadsheetSafe(p.journal),
      spreadsheetSafe(p.doi),
      spreadsheetSafe(p.pdf),
      p.score,
      spreadsheetSafe(p.reason),
      spreadsheetSafe(p.description),
    ]),
  );
}
