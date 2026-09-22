/**
 * Build the generated data layer from the two source CSVs in `data/raw/`.
 *
 * Run via `npm run build:data` (type-checks this directory first, then runs
 * this file with `tsx`). Emits into `src/data/generated/` (dataset.json,
 * conductivity.json, correlations.json, categories.json,
 * feature-glossary.json, columns.ts) and a
 * cleaned copy of the full CSV into `public/data/` for download/export.
 *
 * Every number this script asserts was independently verified against the
 * live pedatamine.org server — see `data/reference/DATA-SPEC.md`. Assertions
 * are the point of this script: they are how a future run of this same
 * script proves the rebuild still matches the original. Every assertion
 * failure prints expected vs. actual and exits non-zero.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import Papa from "papaparse";

import { parseNumericCell, parseTextCell, stripZeroWidth } from "../src/lib/parse";
import { rankCategories } from "../src/lib/category-order";
import { buildCorrelationMatrix } from "../src/lib/correlation";
import { slugifyHeader } from "./slugify";
import { decodeLenientUtf8 } from "./decode-lenient-utf8";

import uiControls from "../data/reference/ui-controls.json";
import featureGlossary from "../data/reference/feature-glossary.json";
import correlationsOriginal from "../data/reference/correlations-original.json";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAW_DIR = path.join(PROJECT_ROOT, "data/raw");
const MAIN_CSV_PATH = path.join(RAW_DIR, "_Cleaned_Final_Data_6_2_2020.csv");
const FORML_CSV_PATH = path.join(RAW_DIR, "_Cleaned_Final_Data-forML_6_2_2020.csv");
const GENERATED_DIR = path.join(PROJECT_ROOT, "src/data/generated");
const PUBLIC_DATA_DIR = path.join(PROJECT_ROOT, "public/data");
const PUBLIC_CSV_PATH = path.join(PUBLIC_DATA_DIR, "polymer-electrolyte-dataset.csv");

// ---------------------------------------------------------------------------
// Small assertion helpers — every one prints expected vs. actual on failure.
// ---------------------------------------------------------------------------

class BuildAssertionError extends Error {}

function assertEqual<T extends string | number | boolean>(
  name: string,
  actual: T,
  expected: T,
): void {
  if (actual !== expected) {
    throw new BuildAssertionError(
      `Invariant failed: ${name}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`,
    );
  }
  console.log(`  [ok] ${name} = ${JSON.stringify(actual)}`);
}

function assertTrue(name: string, condition: boolean, detail?: string): void {
  if (!condition) {
    throw new BuildAssertionError(`Invariant failed: ${name}${detail ? `\n  ${detail}` : ""}`);
  }
  console.log(`  [ok] ${name}`);
}

/** Assert a numeric column has zero (expected vs. actual, else) mismatches against a derived value; prints offending rows if any. */
function assertZeroMismatches(
  name: string,
  rowCount: number,
  expectedAt: (row: number) => number | null,
  actualAt: (row: number) => number | null,
): void {
  const mismatches: number[] = [];
  for (let row = 0; row < rowCount; row++) {
    const expected = expectedAt(row);
    const actual = actualAt(row);
    const bothNull = expected == null && actual == null;
    const closeEnough = expected != null && actual != null && Math.abs(expected - actual) < 1e-9;
    if (!bothNull && !closeEnough) mismatches.push(row);
  }
  if (mismatches.length > 0) {
    const sample = mismatches.slice(0, 10).join(", ");
    throw new BuildAssertionError(
      `Invariant failed: ${name}\n  expected: 0 mismatches\n  actual:   ${mismatches.length} mismatches (row indices: ${sample}${
        mismatches.length > 10 ? ", …" : ""
      })`,
    );
  }
  console.log(`  [ok] ${name} = 0 mismatches (checked ${rowCount} rows)`);
}

function countNonNull(values: readonly (number | null)[]): number {
  let count = 0;
  for (const v of values) if (v != null) count += 1;
  return count;
}

/** Assert a categorical column has no null/blank entries, and return it narrowed to `string[]`. */
function assertNoBlanks(name: string, values: readonly (string | null)[]): string[] {
  const blanks = values.reduce((count, v) => count + (v == null ? 1 : 0), 0);
  assertEqual(`${name}: blank count`, blanks, 0);
  return values as string[];
}

// ---------------------------------------------------------------------------
// CSV reading
// ---------------------------------------------------------------------------

interface CsvTable {
  readonly header: readonly string[];
  readonly rows: ReadonlyArray<Record<string, string>>;
}

function readCsv(absPath: string): CsvTable {
  const decoded = decodeLenientUtf8(fs.readFileSync(absPath));
  const result = Papa.parse<Record<string, string>>(decoded, {
    header: true,
    skipEmptyLines: true,
  });
  if (result.errors.length > 0) {
    const first = result.errors[0];
    throw new BuildAssertionError(
      `Failed to parse ${path.basename(absPath)}: ${result.errors.length} parse error(s), first: ${first.type} ${first.code} ${first.message} (row ${first.row})`,
    );
  }
  return { header: result.meta.fields ?? [], rows: result.data };
}

// ---------------------------------------------------------------------------
// Column plan — DATA-SPEC.md §1: the 41 plottable columns, the 22
// conductivity columns, and the identity/metadata columns, unioned into one
// deterministic 69-column list.
// ---------------------------------------------------------------------------

const CONDUCTIVITY_TEMPS_C = [
  0, 15, 20, 21, 25, 27, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 100, 110, 125,
];
const CONDUCTIVITY_HEADERS = CONDUCTIVITY_TEMPS_C.map((t) => `Conductivity at ${t}C`);

const CATEGORICAL_OF_41 = new Set([
  "Polymer family",
  "Polymer",
  "Anion",
  "crystalline?",
  "Solvent used",
]);

const EXTRA_METADATA_NUMERIC = [
  "Tg polymer without salt",
  "Polymer Mn (kDa)",
  "Polymer Mw (kDa)",
  "Comonomer percentage",
];
const EXTRA_METADATA_TEXT = [
  "DOI",
  "Reference",
  "Notes",
  "SMILES descriptor 1",
  "SMILES descriptor 2",
];

const FROZEN_CATEGORY_HEADERS = [
  "Polymer family",
  "Polymer",
  "Anion",
  "crystalline?",
  "Solvent used",
  "DOI",
];

const UNIT_OVERRIDES: Readonly<Record<string, string>> = {
  Tg: "°C",
  approxTg: "°C",
  "Tg polymer without salt": "°C",
  "drying temp": "°C",
  "Comonomer percentage": "%",
  "Comonomer1 MW": "g/mol",
  "Comonomer2 MW": "g/mol",
};

function deriveUnit(header: string): string | undefined {
  if (header in UNIT_OVERRIDES) return UNIT_OVERRIDES[header];
  if (header.startsWith("Conductivity at ")) return "S/cm";
  const match = /\((.+)\)\s*$/.exec(header);
  return match ? match[1].trim() : undefined;
}

function deriveKind(header: string): "categorical" | "continuous" {
  return CATEGORICAL_OF_41.has(header) || EXTRA_METADATA_TEXT.includes(header)
    ? "categorical"
    : "continuous";
}

type PageId = "explore" | "temperature";

/**
 * Being *plottable* on a page and being *filterable* on it are different
 * things, and conflating them is a trap: `DOI` is offered as a filter on both
 * pages but was never one of the original's 41 x/y/color options, so a single
 * combined list yields 42 where the spec says 41. Derive the two separately.
 */
function derivePageLookups(): {
  plottable: Map<string, PageId[]>;
  filterable: Map<string, PageId[]>;
} {
  const explorePlottable = [
    uiControls.scatterPage["xaxis-column"].options,
    uiControls.scatterPage["yaxis-column"].options,
    uiControls.scatterPage.color.options,
  ].flat();
  const exploreFilterable = uiControls.scatterPage.prefiltervis.options;
  const temperaturePlottable = uiControls.temperaturePage.color.options;
  const temperatureFilterable = uiControls.temperaturePage.prefilter.options;

  const build = (explore: string[], temperature: string[]) => {
    const lookup = new Map<string, PageId[]>();
    for (const header of new Set([...explore, ...temperature])) {
      const pages: PageId[] = [];
      if (explore.includes(header)) pages.push("explore");
      if (temperature.includes(header)) pages.push("temperature");
      lookup.set(header, pages);
    }
    return lookup;
  };

  return {
    plottable: build(explorePlottable, temperaturePlottable),
    filterable: build(exploreFilterable, temperatureFilterable),
  };
}

interface ColumnPlanEntry {
  readonly header: string;
  readonly id: string;
  readonly label: string;
  readonly unit?: string;
  readonly kind: "categorical" | "continuous";
  readonly plottableOn: readonly PageId[];
  readonly filterableOn: readonly PageId[];
  readonly description?: string;
}

function buildColumnPlan(mainHeader: readonly string[]): ColumnPlanEntry[] {
  const plottable = uiControls.scatterPage["xaxis-column"].options;
  for (const header of plottable) {
    assertTrue(`plottable column "${header}" exists in the main CSV`, mainHeader.includes(header));
  }
  for (const header of CONDUCTIVITY_HEADERS) {
    assertTrue(
      `conductivity column "${header}" exists in the main CSV`,
      mainHeader.includes(header),
    );
  }
  for (const header of [...EXTRA_METADATA_NUMERIC, ...EXTRA_METADATA_TEXT]) {
    assertTrue(`metadata column "${header}" exists in the main CSV`, mainHeader.includes(header));
  }

  const allHeaders = [
    ...new Set([
      ...plottable,
      ...CONDUCTIVITY_HEADERS,
      ...EXTRA_METADATA_NUMERIC,
      ...EXTRA_METADATA_TEXT,
    ]),
  ];
  assertEqual(
    "total dataset.json columns (41 plottable + 22 conductivity + 9 metadata, deduped)",
    allHeaders.length,
    69,
  );

  const descriptionByColumn = new Map(featureGlossary.map((f) => [f.mlColumn, f.description]));
  const pageLookups = derivePageLookups();

  const plan = allHeaders.map((header) => ({
    header,
    id: slugifyHeader(header),
    label: header,
    unit: deriveUnit(header),
    kind: deriveKind(header),
    plottableOn: pageLookups.plottable.get(header) ?? [],
    filterableOn: pageLookups.filterable.get(header) ?? [],
    description: descriptionByColumn.get(header),
  }));

  const idCounts = new Map<string, string[]>();
  for (const entry of plan) {
    idCounts.set(entry.id, [...(idCounts.get(entry.id) ?? []), entry.header]);
  }
  const collisions = [...idCounts.entries()].filter(([, headers]) => headers.length > 1);
  assertTrue(
    "every generated column id is unique",
    collisions.length === 0,
    collisions.length > 0 ? `colliding id(s): ${JSON.stringify(collisions)}` : undefined,
  );

  return plan;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log("Reading source CSVs…");
const main = readCsv(MAIN_CSV_PATH);
const forML = readCsv(FORML_CSV_PATH);

console.log("\nSource shape:");
assertEqual("main CSV columns", main.header.length, 305);
assertEqual("main CSV rows", main.rows.length, 655);
assertEqual("forML CSV columns", forML.header.length, 237);
assertEqual("forML CSV rows", forML.rows.length, 271);

console.log("\nBuilding column plan…");
const columnPlan = buildColumnPlan(main.header);
const idByHeader = new Map(columnPlan.map((c) => [c.header, c.id]));

console.log("\nParsing rows…");
const rowCount = main.rows.length;
const numericColumns: Record<string, (number | null)[]> = {};
const categoricalColumns: Record<string, (string | null)[]> = {};
for (const column of columnPlan) {
  if (column.kind === "continuous") numericColumns[column.id] = [];
  else categoricalColumns[column.id] = [];
}

let fffdCount = 0;
main.rows.forEach((row, rowIndex) => {
  for (const column of columnPlan) {
    const raw = row[column.header] ?? "";
    if (raw.includes("�")) fffdCount += 1;
    if (column.kind === "continuous") {
      numericColumns[column.id].push(parseNumericCell(raw, `${column.header} (row ${rowIndex})`));
    } else {
      categoricalColumns[column.id].push(parseTextCell(raw));
    }
  }
});

console.log("\nEncoding sanity check:");
assertEqual(
  "U+FFFD replacement characters in parsed cells (mojibake repair regression guard)",
  fffdCount,
  0,
);

const idOf = (header: string): string => {
  const id = idByHeader.get(header);
  if (!id) throw new BuildAssertionError(`No column id for header ${JSON.stringify(header)}`);
  return id;
};

// ---------------------------------------------------------------------------
// Invariants — DATA-SPEC.md §5 and §9
// ---------------------------------------------------------------------------

console.log("\nInvariants:");
assertEqual("rows", rowCount, 655);

const conductivityValues: (number | null)[][] = Array.from({ length: rowCount }, (_, row) =>
  CONDUCTIVITY_TEMPS_C.map((t) => numericColumns[idOf(`Conductivity at ${t}C`)][row]),
);
const totalConductivityNonNull = conductivityValues.reduce(
  (sum, row) => sum + countNonNull(row),
  0,
);
assertEqual("non-null conductivity cells", totalConductivityNonNull, 5225);

const rowsWithZeroConductivity = conductivityValues.reduce(
  (count, row) => count + (row.every((v) => v == null) ? 1 : 0),
  0,
);
assertEqual("rows with no conductivity at any temperature", rowsWithZeroConductivity, 36);

const rawTg = numericColumns[idOf("Tg")];
assertEqual("rows with non-null Tg", countNonNull(rawTg), 368);

const approxTg = numericColumns[idOf("approxTg")];
assertEqual("rows with non-null approxTg", countNonNull(approxTg), 441);

const tgPolymerWithoutSalt = numericColumns[idOf("Tg polymer without salt")];
assertZeroMismatches(
  "approxTg == Tg else Tg polymer without salt",
  rowCount,
  (row) => rawTg[row] ?? tgPolymerWithoutSalt[row] ?? null,
  (row) => approxTg[row],
);

const approxMW = numericColumns[idOf("approxMW(kDa)")];
const polymerMn = numericColumns[idOf("Polymer Mn (kDa)")];
const polymerMw = numericColumns[idOf("Polymer Mw (kDa)")];
assertZeroMismatches(
  "approxMW(kDa) == Polymer Mn (kDa) else Polymer Mw (kDa)",
  rowCount,
  (row) => polymerMn[row] ?? polymerMw[row] ?? null,
  (row) => approxMW[row],
);

const anion = assertNoBlanks("Anion", categoricalColumns[idOf("Anion")]);
const polymerFamily = assertNoBlanks("Polymer family", categoricalColumns[idOf("Polymer family")]);
const polymer = assertNoBlanks("Polymer", categoricalColumns[idOf("Polymer")]);
const solventUsed = assertNoBlanks("Solvent used", categoricalColumns[idOf("Solvent used")]);
const crystalline = assertNoBlanks("crystalline?", categoricalColumns[idOf("crystalline?")]);
const doi = assertNoBlanks("DOI", categoricalColumns[idOf("DOI")]);

assertEqual("distinct Anion", new Set(anion).size, 12);
assertEqual("distinct Polymer family", new Set(polymerFamily).size, 24);
assertEqual("distinct Polymer", new Set(polymer).size, 78);
assertEqual("distinct Solvent used", new Set(solventUsed).size, 14);
assertEqual("distinct crystalline?", new Set(crystalline).size, 3);
assertEqual("distinct DOI", new Set(doi).size, 65);

// ---------------------------------------------------------------------------
// categories.json — DATA-SPEC.md §7: canonical order frozen once over the
// full 655-row dataset, never over a filtered subset.
// ---------------------------------------------------------------------------

console.log("\nFreezing category order:");
const categorySources: Record<string, readonly string[]> = {
  [idOf("Polymer family")]: polymerFamily,
  [idOf("Polymer")]: polymer,
  [idOf("Anion")]: anion,
  [idOf("crystalline?")]: crystalline,
  [idOf("Solvent used")]: solventUsed,
  [idOf("DOI")]: doi,
};
const categories: Record<string, string[]> = {};
for (const header of FROZEN_CATEGORY_HEADERS) {
  const id = idOf(header);
  categories[id] = rankCategories(categorySources[id]);
  console.log(`  [ok] ${header}: ${categories[id].length} categories, top = ${categories[id][0]}`);
}
// Ground-truth spot check from DATA-SPEC.md §7: frequency order begins
// TFSI, CF3SO3, ClO4, BF4 — distinct from the original's first-appearance order.
assertTrue(
  "Anion frequency order matches DATA-SPEC.md §7 spot check",
  JSON.stringify(categories[idOf("Anion")].slice(0, 4)) ===
    JSON.stringify(["TFSI", "CF3SO3", "ClO4", "BF4"]),
);

// ---------------------------------------------------------------------------
// correlations.json — DATA-SPEC.md §4 / §8: plain Pearson, diagonal exactly 1.0
// ---------------------------------------------------------------------------

console.log("\nComputing correlation matrix:");
const glossaryLabels = featureGlossary.map((f) => f.mlColumn);
assertEqual("correlation feature count", glossaryLabels.length, 36);
assertTrue(
  "correlation label order matches correlations-original.json",
  JSON.stringify(glossaryLabels) === JSON.stringify(correlationsOriginal.labels),
);
for (const label of glossaryLabels) {
  assertTrue(
    `correlation feature "${label}" exists in the forML CSV`,
    forML.header.includes(label),
  );
}

const forMLNumericColumns: Record<string, (number | null)[]> = {};
for (const label of glossaryLabels) {
  forMLNumericColumns[label] = forML.rows.map((row, rowIndex) =>
    parseNumericCell(row[label] ?? "", `${label} (forML row ${rowIndex})`),
  );
}

const correlations = buildCorrelationMatrix(glossaryLabels, forMLNumericColumns);
assertEqual("correlation matrix rows", correlations.matrix.length, 36);
assertTrue(
  "correlation matrix is 36 columns wide throughout",
  correlations.matrix.every((row) => row.length === 36),
);
assertTrue(
  "correlation matrix diagonal is exactly 1.0",
  correlations.matrix.every((row, i) => row[i] === 1),
);

// Prove we understand the original's ddof mismatch: scaling ours by 271/270
// should reproduce it within the tolerance DATA-SPEC.md §4 reports
// (max|diff| = 0.003704). The full regression test lives in
// src/lib/correlation.test.ts; this is a fast build-time sanity check.
{
  const ratio = 271 / 270;
  let maxDiff = 0;
  for (let i = 0; i < 36; i++) {
    for (let j = 0; j < 36; j++) {
      maxDiff = Math.max(
        maxDiff,
        Math.abs(correlations.matrix[i][j] * ratio - correlationsOriginal.matrix[i][j]),
      );
    }
  }
  assertTrue(
    "correlations × 271/270 reproduce the original within 1e-6 (proves the ddof mismatch)",
    maxDiff < 1e-6,
    `max diff = ${maxDiff}`,
  );
}

// ---------------------------------------------------------------------------
// Write generated artifacts
// ---------------------------------------------------------------------------

console.log("\nWriting generated files:");
fs.mkdirSync(GENERATED_DIR, { recursive: true });
fs.mkdirSync(PUBLIC_DATA_DIR, { recursive: true });

interface SizeReport {
  readonly label: string;
  readonly raw: number;
  readonly gzip: number;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function writeAndReport(label: string, absPath: string, content: string): SizeReport {
  fs.writeFileSync(absPath, content, "utf8");
  const raw = Buffer.byteLength(content, "utf8");
  const gzip = gzipSync(Buffer.from(content, "utf8"), { level: 9 }).length;
  console.log(
    `  ${label.padEnd(20)} ${formatBytes(raw).padStart(9)} raw   ${formatBytes(gzip).padStart(9)} gzip`,
  );
  return { label, raw, gzip };
}

const datasetJson = {
  rowCount,
  rowIndex: Array.from({ length: rowCount }, (_, i) => i),
  numeric: numericColumns,
  categorical: categoricalColumns,
};
const conductivityJson = { temps: CONDUCTIVITY_TEMPS_C, values: conductivityValues };
const correlationsJson = { labels: correlations.labels, matrix: correlations.matrix };
const categoriesJson = categories;
// The feature glossary is reference material, but the /features page renders
// it at runtime. Emit it into the generated layer so nothing under `src/`
// imports out of `data/reference/`, which holds reconnaissance artifacts and
// provenance rather than production input.
const featureGlossaryJson = featureGlossary;

const sizeReports: SizeReport[] = [
  writeAndReport(
    "dataset.json",
    path.join(GENERATED_DIR, "dataset.json"),
    JSON.stringify(datasetJson),
  ),
  writeAndReport(
    "conductivity.json",
    path.join(GENERATED_DIR, "conductivity.json"),
    JSON.stringify(conductivityJson),
  ),
  writeAndReport(
    "correlations.json",
    path.join(GENERATED_DIR, "correlations.json"),
    JSON.stringify(correlationsJson),
  ),
  writeAndReport(
    "categories.json",
    path.join(GENERATED_DIR, "categories.json"),
    JSON.stringify(categoriesJson),
  ),
  writeAndReport(
    "feature-glossary.json",
    path.join(GENERATED_DIR, "feature-glossary.json"),
    JSON.stringify(featureGlossaryJson),
  ),
];

// --- columns.ts ---

const numericIds = columnPlan.filter((c) => c.kind === "continuous").map((c) => c.id);
const categoricalIds = columnPlan.filter((c) => c.kind === "categorical").map((c) => c.id);
const frozenCategoryIds = FROZEN_CATEGORY_HEADERS.map(idOf);

const columnMetaLiterals = columnPlan.map((c) => ({
  id: c.id,
  label: c.label,
  unit: c.unit,
  kind: c.kind,
  plottableOn: c.plottableOn,
  filterableOn: c.filterableOn,
  description: c.description,
}));

const columnsTs = `/**
 * GENERATED FILE — do not edit by hand.
 * Run \`npm run build:data\` (scripts/build-data.ts) to regenerate.
 *
 * Typed registry for every column in dataset.json: a stable id, display
 * label (the literal source CSV header), unit where meaningful, whether the
 * column is categorical or continuous, which routed pages plot it and which
 * filter by it (they are NOT the same set — see derivePageLookups), as a
 * control (derived from data/reference/ui-controls.json), and its glossary
 * description where one exists. Only 16 of these 69 columns are also one of
 * the 36 correlation features in data/reference/feature-glossary.json — the
 * other 20 glossary features are forML-only and never appear as a plottable
 * column; they show up solely as labels in correlations.json.
 */

export type ColumnKind = "categorical" | "continuous";
export type PageId = "explore" | "temperature";

export interface ColumnMeta {
  readonly id: string;
  readonly label: string;
  readonly unit?: string;
  readonly kind: ColumnKind;
  readonly plottableOn: readonly PageId[];
  readonly filterableOn: readonly PageId[];
  readonly description?: string;
}

export const COLUMNS: readonly ColumnMeta[] = ${JSON.stringify(columnMetaLiterals, null, 2)};

export const COLUMN_BY_ID: Readonly<Record<string, ColumnMeta>> = Object.fromEntries(
  COLUMNS.map((column) => [column.id, column] as const),
);

export const NUMERIC_COLUMN_IDS = ${JSON.stringify(numericIds)} as const;
export type NumericColumnId = (typeof NUMERIC_COLUMN_IDS)[number];

export const CATEGORICAL_COLUMN_IDS = ${JSON.stringify(categoricalIds)} as const;
export type CategoricalColumnId = (typeof CATEGORICAL_COLUMN_IDS)[number];

export type ColumnId = NumericColumnId | CategoricalColumnId;

/** The subset of categorical columns with a frozen order in categories.json (DATA-SPEC.md §7). */
export const FROZEN_CATEGORY_COLUMN_IDS = ${JSON.stringify(frozenCategoryIds)} as const;
export type FrozenCategoryColumnId = (typeof FROZEN_CATEGORY_COLUMN_IDS)[number];
`;

fs.writeFileSync(path.join(GENERATED_DIR, "columns.ts"), columnsTs, "utf8");
{
  const raw = Buffer.byteLength(columnsTs, "utf8");
  console.log(
    `  ${"columns.ts".padEnd(20)} ${formatBytes(raw).padStart(9)} raw   (TypeScript source, not gzipped for transfer)`,
  );
}

// --- public CSV copy (full 305-column dataset, mojibake-repaired) ---

// Strip the 82 embedded zero-width no-break spaces the source carries inside
// polymer names and notes, so the downloadable CSV matches what the app shows
// — otherwise a name copied out of the UI would not grep against the download.
// Then prepend a real BOM, which is the one place U+FEFF is meaningful: it is
// how Excel recognises a CSV as UTF-8 rather than mangling it as cp1252.
const decodedMainCsv = stripZeroWidth(decodeLenientUtf8(fs.readFileSync(MAIN_CSV_PATH)));
const publicCsv = String.fromCharCode(0xfeff) + decodedMainCsv;
fs.writeFileSync(PUBLIC_CSV_PATH, publicCsv, "utf8");
console.log(
  `  ${"public CSV copy".padEnd(20)} ${formatBytes(Buffer.byteLength(publicCsv, "utf8")).padStart(9)} raw   -> ${path.relative(PROJECT_ROOT, PUBLIC_CSV_PATH)}`,
);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const totalRaw = sizeReports.reduce((sum, r) => sum + r.raw, 0);
const totalGzip = sizeReports.reduce((sum, r) => sum + r.gzip, 0);
console.log(
  `\nAll invariants passed. Generated JSON payload: ${formatBytes(totalRaw)} raw, ${formatBytes(totalGzip)} gzipped (excludes columns.ts and the public CSV copy).`,
);
