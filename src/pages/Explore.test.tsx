import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Link, MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ImportedDataProvider } from "@/contexts";
import { filterRows } from "@/data";
import Explore from "./Explore";

/**
 * The row-count sentence is deliberately split across a bold `<span>` (the
 * live count) and plain text ("of 655 rows selected") so the number stands
 * out visually. That fragmentation means `getByText` can't match the whole
 * sentence as one node (it only matches a single element's own direct text
 * — see https://testing-library.com/docs/queries/bytext/#textmatch-examples
 * for the same caveat), so assertions below target the count `<span>`
 * itself rather than the sentence as a whole.
 */
function rowCountSpans(count: number): HTMLElement[] {
  return screen.queryAllByText(String(count), { selector: "span" });
}

// This is a composition/wiring smoke test: the page's pure logic is already
// covered directly (src/pages/explore/plot-data.test.ts) and jsdom has no
// canvas/WebGL to render real Plotly output against (see the wave brief), so
// `PlotlyChart` itself is stubbed here — everything else in the chart
// barrel (`buildScatterTraces`, `useChartThemeMode`, ...) stays real.
vi.mock("@/components/charts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/charts")>();
  return {
    ...actual,
    // Trace names are surfaced so the CSV-overlay tests can see what
    // would reach Plotly without a canvas.
    PlotlyChart: ({ data }: { data: { name?: string }[] }) => (
      <div data-testid="plotly-stub" data-trace-names={data.map((t) => t.name ?? "").join("|")} />
    ),
  };
});

// jsdom gaps — see Combobox.test.tsx/MultiSelect.test.tsx for the same stubs.
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

function renderExplore() {
  return render(
    <ImportedDataProvider>
      <MemoryRouter initialEntries={["/explore"]}>
        <Explore />
      </MemoryRouter>
    </ImportedDataProvider>,
  );
}

function selectColumn(comboboxName: string, optionName: string) {
  fireEvent.click(screen.getByRole("combobox", { name: comboboxName }));
  fireEvent.click(screen.getByRole("option", { name: optionName }));
}

describe("Explore page", () => {
  it("renders the documented defaults", () => {
    renderExplore();

    expect(screen.getByRole("combobox", { name: "X axis" })).toHaveTextContent("approxTg");
    expect(screen.getByRole("combobox", { name: "Y axis" })).toHaveTextContent(
      "Conductivity at 60C",
    );
    expect(screen.getByRole("combobox", { name: "Color" })).toHaveTextContent("Anion");

    const xScale = screen.getByRole("radiogroup", { name: "X axis scale" });
    expect(within(xScale).getByRole("radio", { name: "Linear" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    const yScale = screen.getByRole("radiogroup", { name: "Y axis scale" });
    expect(within(yScale).getByRole("radio", { name: "Log" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    expect(screen.getByTestId("plotly-stub")).toBeInTheDocument();
  });

  it("shows the full row count with no filters applied", () => {
    renderExplore();
    // Both the mobile summary and the filter panel render this count.
    expect(rowCountSpans(655).length).toBeGreaterThan(0);
  });

  it("shows no log-axis notice for the default X/Y combination", () => {
    renderExplore();
    expect(screen.queryByText(/points hidden/)).not.toBeInTheDocument();
  });

  it("surfaces the Tg-on-log-axis hazard exactly as DATA-SPEC.md describes, once Y is Tg", () => {
    renderExplore();
    // Y's scale is already "Log" by default — DATA-SPEC.md's whole point is
    // that this combination is a trap *without* touching the scale toggle.
    selectColumn("Y axis", "Tg");

    expect(
      screen.getByText("287 of 368 Y-axis points hidden — a log axis can't show Tg values ≤ 0."),
    ).toBeInTheDocument();
  });

  it("flags Polymer as a near-useless color encoding, truthfully, rather than hiding the problem", () => {
    renderExplore();
    selectColumn("Color", "Polymer");
    expect(screen.getByText(/Polymer has 78 distinct values/)).toBeInTheDocument();
  });

  it("does not flag Anion (the default color), which folds acceptably", () => {
    renderExplore();
    expect(screen.queryByText(/distinct values/)).not.toBeInTheDocument();
  });

  it("narrows the row count when a filter is applied", () => {
    // Ground truth from the real dataset, not a guessed number.
    const expectedCount = filterRows({ anion: ["TFSI"] }).length;
    expect(expectedCount).toBeGreaterThan(0);
    expect(expectedCount).toBeLessThan(655);

    renderExplore();
    expect(rowCountSpans(655).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("combobox", { name: "Anion" }));
    fireEvent.click(screen.getByRole("option", { name: "TFSI" }));

    expect(rowCountSpans(655)).toHaveLength(0);
    expect(rowCountSpans(expectedCount).length).toBeGreaterThan(0);
  });

  it("shows an empty-state notice with a way back when a filter matches nothing", () => {
    renderExplore();
    // "na" is a valid crystalline? value but not a real Anion, so combining
    // them (AND across columns) can't match any row.
    fireEvent.click(screen.getByRole("combobox", { name: "Anion" }));
    fireEvent.click(screen.getByRole("option", { name: "TFSI" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Solvent used" }));
    fireEvent.click(screen.getByRole("option", { name: "water" }));
    fireEvent.click(screen.getByRole("combobox", { name: "crystalline?" }));
    fireEvent.click(screen.getByRole("option", { name: "na" }));

    // If this particular combination isn't actually empty for the real
    // dataset, the test below would just fail loudly rather than false-pass,
    // since the empty-state text only renders when the row count is 0.
    expect(screen.getByText("No rows match the selected filters.")).toBeInTheDocument();
    expect(screen.queryByTestId("plotly-stub")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(rowCountSpans(655).length).toBeGreaterThan(0);
  });

  it("shows a Reset to defaults control, distinct from Clear all filters, disabled until something changes", () => {
    renderExplore();

    const reset = screen.getByRole("button", { name: "Reset to defaults" });
    const clearFilters = screen.getByRole("button", { name: "Clear all filters" });
    expect(reset).toBeDisabled();
    expect(clearFilters).toBeDisabled();

    // A non-filter change enables Reset but must leave the narrower
    // Clear-all-filters action alone — proof the two aren't secretly the
    // same control under two names.
    selectColumn("X axis", "Tg");
    expect(screen.getByRole("button", { name: "Reset to defaults" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Clear all filters" })).toBeDisabled();
  });

  it("resetting returns every control — axes, color, and filters — to its default", () => {
    renderExplore();

    selectColumn("X axis", "Tg");
    selectColumn("Color", "Polymer");
    fireEvent.click(screen.getByRole("combobox", { name: "Anion" }));
    fireEvent.click(screen.getByRole("option", { name: "TFSI" }));
    expect(rowCountSpans(655)).toHaveLength(0); // filter narrowed the count

    fireEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));

    expect(screen.getByRole("combobox", { name: "X axis" })).toHaveTextContent("approxTg");
    expect(screen.getByRole("combobox", { name: "Color" })).toHaveTextContent("Anion");
    expect(rowCountSpans(655).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Reset to defaults" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Clear all filters" })).toBeDisabled();
  });

  describe("CSV import overlay", () => {
    function importFile(contents: string, name = "mine.csv") {
      const file = new File([contents], name, { type: "text/csv" });
      fireEvent.change(screen.getByLabelText("CSV file to import"), { target: { files: [file] } });
    }

    function traceNames(): string[] {
      return (screen.getByTestId("plotly-stub").getAttribute("data-trace-names") ?? "").split("|");
    }

    const SAMPLE =
      "approxTg,Conductivity at 60C,Anion,Sample ID\n-40,1e-4,TFSI,A\n10,3e-5,ClO4,B\n";

    it("offers Import CSV, and no Clear button until something is imported", () => {
      renderExplore();
      expect(screen.getByRole("button", { name: "Import CSV" })).toBeEnabled();
      expect(screen.queryByRole("button", { name: "Clear imported data" })).not.toBeInTheDocument();
    });

    it("adds an Imported trace after the dataset's traces and summarizes what matched", async () => {
      renderExplore();
      const before = traceNames();
      expect(before).not.toContain("Imported");

      importFile(SAMPLE);

      expect(await screen.findByText("mine.csv")).toBeInTheDocument();
      expect(screen.getByText(/3 of 4 columns matched/)).toBeInTheDocument();
      expect(screen.getByText("Ignored: Sample ID")).toBeInTheDocument();
      expect(traceNames()).toEqual([...before, "Imported"]);
    });

    it("clearing removes the overlay and returns the plot to its original traces", async () => {
      renderExplore();
      const before = traceNames();
      importFile(SAMPLE);
      await screen.findByText("mine.csv");

      fireEvent.click(screen.getByRole("button", { name: "Clear imported data" }));

      expect(traceNames()).toEqual(before);
      expect(screen.queryByText("mine.csv")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Clear imported data" })).not.toBeInTheDocument();
    });

    it("hides imported rows that fail an active filter, and says so", async () => {
      renderExplore();
      importFile(SAMPLE);
      await screen.findByText("mine.csv");

      fireEvent.click(screen.getByRole("combobox", { name: "Anion" }));
      fireEvent.click(screen.getByRole("option", { name: "TFSI" }));

      expect(
        screen.getByText("1 of 2 imported rows plotted: 1 don't match the active filters."),
      ).toBeInTheDocument();
      expect(traceNames()).toContain("Imported");
    });

    it("names the dataset trace when a continuous color column shares the legend", async () => {
      renderExplore();
      selectColumn("Color", "Tg");
      importFile(SAMPLE);
      await screen.findByText("mine.csv");
      expect(traceNames()).toEqual(["Dataset", "Imported"]);
    });

    it("explains when no columns match, and imports nothing", async () => {
      renderExplore();
      importFile("foo,bar\n1,2\n", "wrong.csv");

      expect(
        await screen.findByText(/None of the column headers in wrong\.csv/),
      ).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Clear imported data" })).not.toBeInTheDocument();
      expect(traceNames()).not.toContain("Imported");
    });

    it("survives navigating to another page and back", async () => {
      // Same nesting as App.tsx: the provider sits above the router, so
      // Explore unmounting on a route change doesn't take the import with it.
      render(
        <ImportedDataProvider>
          <MemoryRouter initialEntries={["/explore"]}>
            <Routes>
              <Route
                element={
                  <>
                    <Link to="/data">Go to Data</Link>
                    <Link to="/explore">Go to Explore</Link>
                    <Outlet />
                  </>
                }
              >
                <Route path="explore" element={<Explore />} />
                <Route path="data" element={<p>Data page</p>} />
              </Route>
            </Routes>
          </MemoryRouter>
        </ImportedDataProvider>,
      );
      importFile(SAMPLE);
      await screen.findByText("mine.csv");

      fireEvent.click(screen.getByRole("link", { name: "Go to Data" }));
      expect(screen.getByText("Data page")).toBeInTheDocument();
      expect(screen.queryByTestId("plotly-stub")).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("link", { name: "Go to Explore" }));
      expect(await screen.findByText("mine.csv")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Clear imported data" })).toBeInTheDocument();
      expect(traceNames()).toContain("Imported");
    });

    it("is untouched by Reset to defaults", async () => {
      renderExplore();
      importFile(SAMPLE);
      await screen.findByText("mine.csv");
      selectColumn("X axis", "Tg");

      fireEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));

      await waitFor(() => expect(traceNames()).toContain("Imported"));
      expect(screen.getByText("mine.csv")).toBeInTheDocument();
    });
  });
});
