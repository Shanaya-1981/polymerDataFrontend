import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
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
    PlotlyChart: () => <div data-testid="plotly-stub" />,
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
    <MemoryRouter initialEntries={["/explore"]}>
      <Explore />
    </MemoryRouter>,
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
});
