/**
 * CSV serialization for exporting the current (filtered) view — e.g. from
 * the `/data` table. RFC 4180 quoting: a field is wrapped in double quotes
 * if it contains a comma, a double quote, or a line break, and any double
 * quote inside it is doubled. Rows are joined with CRLF, the conventional
 * CSV line ending (and what Excel expects).
 *
 * `toCsv` builds the CSV string; `downloadCsv` hands one to the browser as
 * a file. Both are shared by the `/data` and `/extract` pages, which is why
 * they live here rather than with either page.
 */
export type CsvCell = string | number | null | undefined;

function escapeCell(cell: CsvCell): string {
  if (cell == null) return "";
  const text = String(cell);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** Build a complete CSV document (header row + data rows) as a string. */
export function toCsv(headers: readonly string[], rows: ReadonlyArray<readonly CsvCell[]>): string {
  const lines = [headers.map(escapeCell).join(",")];
  for (const row of rows) {
    lines.push(row.map(escapeCell).join(","));
  }
  return lines.join("\r\n");
}

/**
 * Trigger a client-side download of a CSV string. All side effect and not
 * meaningfully unit-testable, so it's kept to this one small function with
 * no corresponding test.
 */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
