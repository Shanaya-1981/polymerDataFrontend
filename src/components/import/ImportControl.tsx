import { useRef, type ChangeEvent } from "react";
import { Button, Notice } from "@/components/ui";
import { useImportedData } from "@/contexts";
import { COLUMN_BY_ID } from "@/data";
import { importErrorMessage, readImportFile, type ImportedDataset } from "./csv-import";

/**
 * "Import CSV" plus, once something is loaded, "Clear imported data".
 * Returns bare siblings so they share a wrapping row with "Reset to
 * defaults" in each chart page's controls. The file input is reached through a ref,
 * never an id: `ChartPageLayout` can mount the controls twice (sidebar and
 * mobile sheet).
 */
export function ImportButtons() {
  const { imported, setImported, setImportError, clearImported } = useImportedData();
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function importFile(file: File) {
    const result = await readImportFile(file);
    if (result.ok) setImported(result.data);
    // A failed import leaves any previous one in place.
    else setImportError(importErrorMessage(result));
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset so picking the same file again (after editing it) still fires.
    event.target.value = "";
    if (file) void importFile(file);
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
        Import CSV
      </Button>
      {imported ? (
        <Button variant="ghost" size="sm" onClick={clearImported}>
          Clear imported data
        </Button>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        aria-label="CSV file to import"
        className="hidden"
        onChange={handleChange}
      />
    </>
  );
}

const MAX_LISTED_HEADERS = 5;

/** What got imported (and what didn't), or why an import failed. */
export function ImportStatus() {
  const { imported, importError: error } = useImportedData();
  if (!imported && !error) return null;

  return (
    <div className="flex flex-col gap-2">
      {error ? <Notice tone="warning">{error}</Notice> : null}
      {imported ? <ImportSummary imported={imported} /> : null}
    </div>
  );
}

function ImportSummary({ imported }: { imported: ImportedDataset }) {
  const { fileName, rowCount, matchedColumnIds, ignoredHeaders, invalidNumericCount } = imported;
  const listed = ignoredHeaders.slice(0, MAX_LISTED_HEADERS);
  const unlisted = ignoredHeaders.length - listed.length;

  return (
    <div className="flex flex-col gap-1 text-xs text-muted">
      <p className="text-sm text-secondary">
        <span className="font-medium break-all text-primary">{fileName}</span> · {rowCount}{" "}
        {rowCount === 1 ? "row" : "rows"} · {matchedColumnIds.length} of{" "}
        {matchedColumnIds.length + ignoredHeaders.length} columns matched
      </p>
      <p>Matched: {matchedColumnIds.map((id) => COLUMN_BY_ID[id].label).join(", ")}</p>
      {ignoredHeaders.length > 0 ? (
        <p>
          Ignored: {listed.join(", ")}
          {unlisted > 0 ? `, and ${unlisted} more` : ""}
        </p>
      ) : null}
      {invalidNumericCount > 0 ? (
        <p>
          {invalidNumericCount} non-numeric {invalidNumericCount === 1 ? "value" : "values"} in
          numeric columns treated as missing.
        </p>
      ) : null}
    </div>
  );
}
