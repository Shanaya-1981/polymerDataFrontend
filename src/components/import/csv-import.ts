/**
 * Parse a user-supplied CSV into the same columnar shape `@/data` uses, so
 * the Explore page can overlay "your" rows on the literature scatter.
 *
 * Session-only by design: the result lives in React state and nothing here
 * touches the verified dataset, storage, or the network. Pure apart from
 * `readImportFile`'s `File.text()`, so everything else is unit-testable
 * without jsdom.
 *
 * Headers are matched to the registry's column ids *or* labels (the label
 * is the original source CSV header, so a file exported from `/data` or the
 * upstream repo matches as-is). Matching ignores case and stray whitespace;
 * unmatched headers are reported, never guessed at.
 */
import Papa from "papaparse";
import {
  categoryOrder,
  COLUMNS,
  FROZEN_CATEGORY_COLUMN_IDS,
  NUMERIC_COLUMN_IDS,
  type CategoricalColumnId,
  type ColumnId,
  type ColumnMeta,
  type FrozenCategoryColumnId,
  type NumericColumnId,
} from "@/data";
import { parseNumericCell, parseTextCell, stripZeroWidth } from "@/lib/parse";

/** Keeps the overlay inside what the SVG scatter renders comfortably
 *  (see `plotly.ts` on why there is no WebGL trace type). */
export const MAX_IMPORT_ROWS = 5000;

export interface ImportedDataset {
  readonly fileName: string;
  readonly rowCount: number;
  readonly numeric: Readonly<Partial<Record<NumericColumnId, readonly (number | null)[]>>>;
  readonly categorical: Readonly<Partial<Record<CategoricalColumnId, readonly (string | null)[]>>>;
  /** Matched columns, in the file's header order. */
  readonly matchedColumnIds: readonly ColumnId[];
  /** Headers that matched no column (or repeated an already-matched one). */
  readonly ignoredHeaders: readonly string[];
  /** Cells in numeric columns that weren't numbers — stored as missing. */
  readonly invalidNumericCount: number;
}

export type ImportError = "no-matching-columns" | "no-rows" | "too-many-rows" | "unreadable";

export type ImportResult =
  | { readonly ok: true; readonly data: ImportedDataset }
  | {
      readonly ok: false;
      readonly error: ImportError;
      readonly fileName: string;
      readonly rowCount?: number;
    };

function normalizeHeader(header: string): string {
  return stripZeroWidth(header).replace(/\s+/g, " ").trim().toLowerCase();
}

/** Normalized id-or-label -> column. Ids go in first so a label wins any
 *  collision, though none exist today (see `csv-import.test.ts`). */
const COLUMN_BY_HEADER: ReadonlyMap<string, ColumnMeta> = (() => {
  const map = new Map<string, ColumnMeta>();
  for (const column of COLUMNS) map.set(normalizeHeader(column.id), column);
  for (const column of COLUMNS) map.set(normalizeHeader(column.label), column);
  return map;
})();

export function matchHeader(header: string): ColumnMeta | undefined {
  return COLUMN_BY_HEADER.get(normalizeHeader(header));
}

const NUMERIC_IDS: ReadonlySet<string> = new Set(NUMERIC_COLUMN_IDS);
const FROZEN_IDS: ReadonlySet<string> = new Set(FROZEN_CATEGORY_COLUMN_IDS);

const canonicalCategoryCache = new Map<FrozenCategoryColumnId, ReadonlyMap<string, string>>();

/**
 * Snap a category to the dataset's own spelling when they differ only by
 * case ("tfsi" -> "TFSI"), so an imported row lands on the same
 * category-axis tick as the dataset's. Unknown values pass through
 * unchanged.
 */
function canonicalCategory(columnId: FrozenCategoryColumnId, value: string): string {
  let lookup = canonicalCategoryCache.get(columnId);
  if (!lookup) {
    lookup = new Map(categoryOrder(columnId).map((v) => [v.toLowerCase(), v]));
    canonicalCategoryCache.set(columnId, lookup);
  }
  return lookup.get(value.toLowerCase()) ?? value;
}

/** Lenient twin of `parseNumericCell`: junk becomes `null` instead of
 *  throwing, since a user's file is not the verified dataset. */
function parseUserNumber(raw: string): { value: number | null; invalid: boolean } {
  try {
    return { value: parseNumericCell(raw), invalid: false };
  } catch {
    return { value: null, invalid: true };
  }
}

export function parseImportCsv(text: string, fileName: string): ImportResult {
  const parsed = Papa.parse<Record<string, string | undefined>>(text, {
    header: true,
    skipEmptyLines: "greedy",
  });
  // Row-level warnings (e.g. a short row) are tolerated: missing cells
  // simply read as blank below, same as an empty cell would.
  const headers = parsed.meta.fields ?? [];

  const matched: { header: string; column: ColumnMeta }[] = [];
  const ignoredHeaders: string[] = [];
  const seen = new Set<string>();
  for (const header of headers) {
    const column = matchHeader(header);
    if (column && !seen.has(column.id)) {
      seen.add(column.id);
      matched.push({ header, column });
    } else if (header.trim() !== "") {
      ignoredHeaders.push(header);
    }
  }

  const rows = parsed.data;
  if (matched.length === 0) return { ok: false, error: "no-matching-columns", fileName };
  if (rows.length === 0) return { ok: false, error: "no-rows", fileName };
  if (rows.length > MAX_IMPORT_ROWS) {
    return { ok: false, error: "too-many-rows", fileName, rowCount: rows.length };
  }

  const numeric: Partial<Record<NumericColumnId, (number | null)[]>> = {};
  const categorical: Partial<Record<CategoricalColumnId, (string | null)[]>> = {};
  let invalidNumericCount = 0;

  for (const { header, column } of matched) {
    const cells = rows.map((row) => row[header] ?? "");
    if (NUMERIC_IDS.has(column.id)) {
      numeric[column.id as NumericColumnId] = cells.map((raw) => {
        const { value, invalid } = parseUserNumber(raw);
        if (invalid) invalidNumericCount += 1;
        return value;
      });
    } else {
      const id = column.id as CategoricalColumnId;
      categorical[id] = cells.map((raw) => {
        const value = parseTextCell(raw);
        if (value == null || !FROZEN_IDS.has(id)) return value;
        return canonicalCategory(id as FrozenCategoryColumnId, value);
      });
    }
  }

  return {
    ok: true,
    data: {
      fileName,
      rowCount: rows.length,
      numeric,
      categorical,
      matchedColumnIds: matched.map(({ column }) => column.id as ColumnId),
      ignoredHeaders,
      invalidNumericCount,
    },
  };
}

export async function readImportFile(file: File): Promise<ImportResult> {
  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, error: "unreadable", fileName: file.name };
  }
  return parseImportCsv(text, file.name);
}

export function importErrorMessage(result: Extract<ImportResult, { ok: false }>): string {
  switch (result.error) {
    case "no-matching-columns":
      return (
        `None of the column headers in ${result.fileName} match this dataset's columns, so nothing was ` +
        `imported. Use the dataset's own headers — e.g. "approxTg", "Conductivity at 60C", "Anion".`
      );
    case "no-rows":
      return `${result.fileName} has matching headers but no data rows.`;
    case "too-many-rows":
      return (
        `${result.fileName} has ${result.rowCount ?? "too many"} rows; the overlay supports up to ` +
        `${MAX_IMPORT_ROWS}. Split the file or filter it down first.`
      );
    case "unreadable":
      return `${result.fileName} couldn't be read. Check that it's a plain-text CSV file.`;
  }
}
