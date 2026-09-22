/**
 * CSV serialization for exporting the current (filtered) view — e.g. from
 * the `/data` table. RFC 4180 quoting: a field is wrapped in double quotes
 * if it contains a comma, a double quote, or a line break, and any double
 * quote inside it is doubled. Rows are joined with CRLF, the conventional
 * CSV line ending (and what Excel expects).
 *
 * This module only builds the CSV string — triggering a browser download is
 * a UI concern left to the component that calls it.
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
