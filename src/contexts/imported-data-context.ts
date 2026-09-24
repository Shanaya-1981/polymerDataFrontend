import { createContext, useContext } from "react";
// Type-only on purpose: the provider is mounted in App.tsx, i.e. the entry
// chunk, and a value import of csv-import.ts would drag papaparse and the
// whole dataset into every cold page load. Parsing stays in the Explore chunk.
import type { ImportedDataset } from "@/pages/explore/csv-import";

export interface ImportedDataContextValue {
  /** The session-only CSV overlay, if one is loaded. */
  imported: ImportedDataset | null;
  /** Why the most recent import attempt failed, if it did. */
  importError: string | null;
  /** Replace the overlay with a newly parsed file (clears any error). */
  setImported: (data: ImportedDataset) => void;
  /** Record a failed import — any previous overlay stays in place. */
  setImportError: (message: string) => void;
  /** Drop the overlay and any error. */
  clearImported: () => void;
}

export const ImportedDataContext = createContext<ImportedDataContextValue | null>(null);

/** Read and update the imported CSV overlay shared across page switches. */
export function useImportedData(): ImportedDataContextValue {
  const ctx = useContext(ImportedDataContext);
  if (!ctx) {
    throw new Error("useImportedData must be used within an <ImportedDataProvider>");
  }
  return ctx;
}
