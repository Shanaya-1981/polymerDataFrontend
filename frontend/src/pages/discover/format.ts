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

export function papersCsv(papers: readonly DiscoveredPaper[]): string {
  return toCsv(
    ["title", "authors", "year", "journal", "doi", "pdf", "score", "reason", "description"],
    papers.map((p) => [
      p.title,
      p.authors.join("; "),
      p.year,
      p.journal,
      p.doi,
      p.pdf,
      p.score,
      p.reason,
      p.description,
    ]),
  );
}
