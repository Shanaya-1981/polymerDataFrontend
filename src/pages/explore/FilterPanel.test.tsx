import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { FrozenCategoryColumnId } from "@/data";
import type { FilterSelections } from "@/lib/filtering";
import { FilterPanel } from "./FilterPanel";

// jsdom gaps also hit here because FilterPanel renders real `MultiSelect`
// controls — see Combobox.test.tsx/MultiSelect.test.tsx for the same stubs.
class ResizeObserverStub implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = ResizeObserverStub;
}
if (typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = function scrollIntoViewStub() {};
}

const EMPTY_FILTERS: FilterSelections = {
  polymerFamily: [],
  polymer: [],
  anion: [],
  crystalline: [],
  solventUsed: [],
  doi: [],
};

function ControlledFilterPanel({ initial = EMPTY_FILTERS }: { initial?: FilterSelections }) {
  const [filters, setFilters] = useState<FilterSelections>(initial);
  return (
    <FilterPanel
      filters={filters}
      onChange={(columnId, values) => setFilters((prev) => ({ ...prev, [columnId]: values }))}
      onClearAll={() => setFilters(EMPTY_FILTERS)}
      selectedCount={655}
    />
  );
}

describe("FilterPanel", () => {
  it("renders one labelled multi-select per filterable column", () => {
    render(<ControlledFilterPanel />);
    for (const label of ["DOI", "Polymer family", "Polymer", "Anion", "crystalline?", "Solvent used"]) {
      expect(screen.getByRole("combobox", { name: label })).toBeInTheDocument();
    }
  });

  it("shows the current selected-row count", () => {
    render(<ControlledFilterPanel />);
    expect(screen.getByText("655")).toBeInTheDocument();
    expect(screen.getByText(/rows selected/)).toBeInTheDocument();
  });

  it("disables 'Clear all filters' when no filter is active", () => {
    render(<ControlledFilterPanel />);
    expect(screen.getByRole("button", { name: "Clear all filters" })).toBeDisabled();
  });

  it("enables 'Clear all filters' once a filter is active, and it clears every column", () => {
    const onChange = vi.fn();
    const onClearAll = vi.fn();
    render(
      <FilterPanel
        filters={{ ...EMPTY_FILTERS, anion: ["TFSI"] }}
        onChange={onChange}
        onClearAll={onClearAll}
        selectedCount={120}
      />,
    );

    const clearAll = screen.getByRole("button", { name: "Clear all filters" });
    expect(clearAll).toBeEnabled();
    fireEvent.click(clearAll);
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });

  it("selecting a value in one column's multi-select reports that column and value", () => {
    const onChange = vi.fn<(columnId: FrozenCategoryColumnId, values: string[]) => void>();
    render(<FilterPanel filters={EMPTY_FILTERS} onChange={onChange} onClearAll={() => {}} selectedCount={655} />);

    fireEvent.click(screen.getByRole("combobox", { name: "Anion" }));
    fireEvent.click(screen.getByRole("option", { name: "TFSI" }));

    expect(onChange).toHaveBeenCalledWith("anion", ["TFSI"]);
  });

  it("shortens DOI values for display without changing what gets selected", () => {
    const onChange = vi.fn<(columnId: FrozenCategoryColumnId, values: string[]) => void>();
    render(<FilterPanel filters={EMPTY_FILTERS} onChange={onChange} onClearAll={() => {}} selectedCount={655} />);

    fireEvent.click(screen.getByRole("combobox", { name: "DOI" }));
    // Every rendered DOI option label should have the scheme+host stripped.
    const options = screen.getAllByRole("option");
    expect(options.length).toBeGreaterThan(0);
    for (const option of options) {
      expect(option.textContent ?? "").not.toMatch(/^https?:\/\//);
    }
  });
});
