import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { parseImportCsv, type ImportedDataset } from "@/pages/explore/csv-import";
import { useImportedData } from "./imported-data-context";
import { ImportedDataProvider } from "./ImportedDataProvider";

function dataset(text: string, name: string): ImportedDataset {
  const result = parseImportCsv(text, name);
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

const first = dataset("Tg\n1\n", "first.csv");
const second = dataset("Tg\n2\n", "second.csv");

function wrapper({ children }: { children: ReactNode }) {
  return <ImportedDataProvider>{children}</ImportedDataProvider>;
}

describe("ImportedDataProvider", () => {
  it("starts empty", () => {
    const { result } = renderHook(() => useImportedData(), { wrapper });
    expect(result.current.imported).toBeNull();
    expect(result.current.importError).toBeNull();
  });

  it("setImported replaces the overlay and clears a previous error", () => {
    const { result } = renderHook(() => useImportedData(), { wrapper });
    act(() => result.current.setImported(first));
    act(() => result.current.setImportError("bad file"));
    act(() => result.current.setImported(second));
    expect(result.current.imported).toBe(second);
    expect(result.current.importError).toBeNull();
  });

  it("setImportError keeps the previous overlay in place", () => {
    const { result } = renderHook(() => useImportedData(), { wrapper });
    act(() => result.current.setImported(first));
    act(() => result.current.setImportError("bad file"));
    expect(result.current.imported).toBe(first);
    expect(result.current.importError).toBe("bad file");
  });

  it("clearImported drops both the overlay and the error", () => {
    const { result } = renderHook(() => useImportedData(), { wrapper });
    act(() => result.current.setImported(first));
    act(() => result.current.setImportError("bad file"));
    act(() => result.current.clearImported());
    expect(result.current.imported).toBeNull();
    expect(result.current.importError).toBeNull();
  });

  it("does not persist anything to web storage", () => {
    const { result } = renderHook(() => useImportedData(), { wrapper });
    act(() => result.current.setImported(first));
    expect(window.localStorage.length).toBe(0);
    expect(JSON.stringify({ ...window.sessionStorage })).not.toContain("first.csv");
  });
});

describe("useImportedData", () => {
  it("throws outside the provider", () => {
    expect(() => renderHook(() => useImportedData())).toThrow(
      "useImportedData must be used within an <ImportedDataProvider>",
    );
  });
});
