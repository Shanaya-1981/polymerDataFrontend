import { useCallback, useMemo, useState, type ReactNode } from "react";
import type { ImportedDataset } from "@/components/import";
import { ImportedDataContext } from "./imported-data-context";

/**
 * Holds the imported CSV above the router, so it survives navigating to
 * another page and back, and both chart pages overlay the same file. Plain React state and nothing else —
 * no storage, no URL — so a browser refresh still clears it.
 */
export function ImportedDataProvider({ children }: { children: ReactNode }) {
  const [imported, setImportedState] = useState<ImportedDataset | null>(null);
  const [importError, setImportErrorState] = useState<string | null>(null);

  const setImported = useCallback((data: ImportedDataset) => {
    setImportedState(data);
    setImportErrorState(null);
  }, []);

  const setImportError = useCallback((message: string) => {
    setImportErrorState(message);
  }, []);

  const clearImported = useCallback(() => {
    setImportedState(null);
    setImportErrorState(null);
  }, []);

  const value = useMemo(
    () => ({ imported, importError, setImported, setImportError, clearImported }),
    [imported, importError, setImported, setImportError, clearImported],
  );

  return <ImportedDataContext.Provider value={value}>{children}</ImportedDataContext.Provider>;
}
