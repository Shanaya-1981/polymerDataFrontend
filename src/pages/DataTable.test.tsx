import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { filterRows, getRows } from "@/data";
import { matchesSearch } from "./data/search";
import DataTable from "./DataTable";

// jsdom gaps — see Combobox.test.tsx/MultiSelect.test.tsx for the same stubs.
// This page renders several MultiSelects (the column picker, and one per
// filter once the Filters panel is open), all built on cmdk.
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

function renderDataTable() {
  return render(
    <MemoryRouter initialEntries={["/data"]}>
      <DataTable />
    </MemoryRouter>,
  );
}

function selectOption(comboboxName: string, optionName: string) {
  fireEvent.click(screen.getByRole("combobox", { name: comboboxName }));
  fireEvent.click(screen.getByRole("option", { name: optionName }));
}

describe("DataTable page", () => {
  it("renders the documented default columns as real table headers", () => {
    renderDataTable();
    for (const name of ["Polymer", "Polymer family", "Anion", "crystalline?", "Solvent used", "DOI"]) {
      expect(screen.getByRole("columnheader", { name })).toBeInTheDocument();
    }
    // Reference is a real column, just not one of the eleven defaults.
    expect(screen.queryByRole("columnheader", { name: "Reference" })).not.toBeInTheDocument();
  });

  it("shows the full row count on first load, page 1 of 25", () => {
    renderDataTable();
    expect(screen.getByRole("status")).toHaveTextContent("Showing 1–25 of 655 rows.");
    expect(screen.getByText("Page 1 of 27")).toBeInTheDocument();
  });

  it("renders DOI values as real, shortened links", () => {
    renderDataTable();
    const links = screen.getAllByRole("link");
    const doiLink = links.find((link) => link.getAttribute("href")?.startsWith("https://doi.org/"));
    expect(doiLink).toBeDefined();
    expect(doiLink).toHaveAttribute("target", "_blank");
    expect(doiLink?.textContent).not.toMatch(/^https?:\/\//);
  });

  it("links the complete 305-column dataset as a static download, unmodified", () => {
    renderDataTable();
    const link = screen.getByRole("link", { name: "Full dataset (305 cols, CSV)" });
    expect(link).toHaveAttribute("href", "/data/polymer-electrolyte-dataset.csv");
    expect(link).toHaveAttribute("download");
  });

  it("sorts ascending on first header click and descending on the second", () => {
    renderDataTable();
    const header = () => screen.getByRole("columnheader", { name: "Anion" });
    expect(header()).toHaveAttribute("aria-sort", "none");

    fireEvent.click(screen.getByRole("button", { name: "Anion" }));
    expect(header()).toHaveAttribute("aria-sort", "ascending");

    fireEvent.click(screen.getByRole("button", { name: "Anion" }));
    expect(header()).toHaveAttribute("aria-sort", "descending");
  });

  it("narrows the row count when searching, matching matchesSearch's own logic", () => {
    const expectedCount = getRows().filter((r) => matchesSearch(r, "carbonate")).length;
    expect(expectedCount).toBeGreaterThan(0);
    expect(expectedCount).toBeLessThan(655);

    renderDataTable();
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "carbonate" } });

    expect(screen.getByRole("status")).toHaveTextContent(
      `of ${expectedCount} rows (filtered from 655)`,
    );
  });

  it("narrows the row count when a filter is applied, combined AND-across with search semantics from @/lib/filtering", () => {
    const expectedCount = filterRows({ anion: ["TFSI"] }).length;
    expect(expectedCount).toBeGreaterThan(0);

    renderDataTable();
    fireEvent.click(screen.getByRole("button", { name: /Filters/ }));
    selectOption("Anion", "TFSI");

    expect(screen.getByRole("status")).toHaveTextContent(`of ${expectedCount} rows`);
    expect(screen.getByRole("button", { name: "Filters (1)" })).toBeInTheDocument();
  });

  it("shows an empty state with a working clear action when nothing matches", () => {
    renderDataTable();
    fireEvent.change(screen.getByLabelText("Search"), {
      target: { value: "zzz-not-a-real-value-zzz" },
    });

    expect(screen.getByText("No rows match the current search and filters.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export view (CSV)" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Clear search and filters" }));
    expect(screen.getByRole("status")).toHaveTextContent("of 655 rows");
  });

  it("moves to the next page and updates the summary and page indicator", () => {
    renderDataTable();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByRole("status")).toHaveTextContent("Showing 26–50 of 655 rows.");
    expect(screen.getByText("Page 2 of 27")).toBeInTheDocument();
  });

  it("adds a non-default column through the Columns picker", () => {
    renderDataTable();
    expect(screen.queryByRole("columnheader", { name: "Reference" })).not.toBeInTheDocument();

    selectOption("Columns", "Reference");

    expect(screen.getByRole("columnheader", { name: "Reference" })).toBeInTheDocument();
  });
});
