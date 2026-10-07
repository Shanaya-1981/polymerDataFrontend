import { fireEvent, render, screen, within } from "@testing-library/react";
import { Link, MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ImportedDataProvider } from "@/contexts";
import Explore from "./Explore";
import Temperature from "./Temperature";

// Composition/wiring test for the y-axis control and the CSV overlay — the
// pipeline itself is covered in temperature/traces.test.ts. jsdom has no
// canvas, so `PlotlyChart` is stubbed to report what it would receive (each
// trace's name, legend, point count and first y; the layout's y-axis and
// legends); the rest of the chart barrel stays real, as in Explore.test.tsx.
vi.mock("@/components/charts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/charts")>();
  return {
    ...actual,
    PlotlyChart: ({ data, layout }: PlotlyStubProps) => (
      <div
        data-testid="plotly-stub"
        data-traces={JSON.stringify(
          data.map((t) => ({
            name: t.name ?? "",
            legend: t.legend ?? "legend",
            points: t.x?.filter((v) => v !== null).length ?? 0,
            firstY: t.y?.find((v) => v !== null) ?? null,
          })),
        )}
        data-layout={JSON.stringify({
          yaxis: layout?.yaxis,
          legend: layout?.legend,
          legend2: layout?.legend2,
        })}
      />
    ),
  };
});

interface PlotlyStubProps {
  data: { name?: string; legend?: string; x?: unknown[]; y?: unknown[] }[];
  layout?: Record<string, unknown>;
}

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

function renderTemperature() {
  return render(
    <ImportedDataProvider>
      <MemoryRouter initialEntries={["/temperature"]}>
        <Temperature />
      </MemoryRouter>
    </ImportedDataProvider>,
  );
}

function importFile(contents: string, name = "mine.csv") {
  const file = new File([contents], name, { type: "text/csv" });
  fireEvent.change(screen.getByLabelText("CSV file to import"), { target: { files: [file] } });
}

interface StubTrace {
  name: string;
  legend: string;
  points: number;
  firstY: number | null;
}

interface StubLayout {
  yaxis?: { type?: string; title?: { text?: string } };
  legend?: { title?: { text?: string } };
  legend2?: { title?: { text?: string } };
}

function stubTraces(): StubTrace[] {
  const json = screen.getByTestId("plotly-stub").getAttribute("data-traces") ?? "[]";
  return JSON.parse(json) as StubTrace[];
}

function stubLayout(): StubLayout {
  const json = screen.getByTestId("plotly-stub").getAttribute("data-layout") ?? "{}";
  return JSON.parse(json) as StubLayout;
}

/** The overlay: one trace per formulation in the imported legend, or a
 *  single "Imported" trace when there's nothing to split by. */
function isImported(trace: StubTrace): boolean {
  return trace.legend === "legend2" || trace.name === "Imported";
}

function importedTraces(): StubTrace[] {
  return stubTraces().filter(isImported);
}

function importedPointCount(): number {
  return importedTraces().reduce((sum, trace) => sum + trace.points, 0);
}

function selectYAxis(label: string) {
  const group = screen.getByRole("radiogroup", { name: "Y axis" });
  fireEvent.click(within(group).getByRole("radio", { name: label }));
}

function selectFilter(column: string, value: string) {
  fireEvent.click(screen.getByRole("combobox", { name: column }));
  fireEvent.click(screen.getByRole("option", { name: value }));
}

// Row 2 has no Tg, so it drops out of T/Tg and VFT only.
const SAMPLE =
  "Tg,Anion,Conductivity at 30C,Conductivity at 60C\n-40,TFSI,1e-5,1e-4\n,ClO4,2e-6,2e-5\n";

describe("Temperature page — CSV import overlay", () => {
  it("offers Import CSV next to Reset to defaults, and no Clear button yet", () => {
    renderTemperature();
    expect(screen.getByRole("button", { name: "Reset to defaults" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import CSV" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Clear imported data" })).not.toBeInTheDocument();
  });

  it("adds one imported trace per formulation after the dataset's, and counts them", async () => {
    renderTemperature();
    const before = stubTraces();
    expect(before.some(isImported)).toBe(false);

    importFile(SAMPLE);

    expect(await screen.findByText("mine.csv")).toBeInTheDocument();
    expect(stubTraces().slice(0, before.length)).toEqual(before);
    // Colored by Anion (the default), in the dataset's own order, in a
    // legend of their own so each can be toggled.
    expect(importedTraces().map(({ name, legend, points }) => ({ name, legend, points }))).toEqual([
      { name: "TFSI", legend: "legend2", points: 2 },
      { name: "ClO4", legend: "legend2", points: 2 },
    ]);
    expect(stubLayout().legend?.title?.text).toBe("<b>Dataset</b>");
    expect(stubLayout().legend2?.title?.text).toBe("<b>Imported</b>");
    expect(screen.getByText(/· 2 imported/)).toBeInTheDocument();
  });

  it("in T/Tg, plots only the rows with a Tg and says why the other is missing", async () => {
    renderTemperature();
    importFile(SAMPLE);
    await screen.findByText("mine.csv");

    fireEvent.click(screen.getByRole("radio", { name: "T/Tg" }));

    expect(
      screen.getByText("1 of 2 imported rows plotted: 1 has no Tg, which T/Tg needs."),
    ).toBeInTheDocument();
    expect(importedTraces().map((trace) => trace.name)).toEqual(["TFSI"]);
  });

  it("explains a file with no Tg column once a Tg-based mode is picked", async () => {
    renderTemperature();
    importFile("Conductivity at 30C\n1e-5\n");
    await screen.findByText("mine.csv");
    // No Anion column, so a single entry; Arrhenius needs no Tg.
    expect(importedTraces().map((trace) => trace.name)).toEqual(["Imported"]);

    fireEvent.click(screen.getByRole("radio", { name: "VFT" }));

    expect(
      screen.getByText('VFT needs each sample\'s Tg, and the imported file has no "Tg" column.'),
    ).toBeInTheDocument();
    expect(importedTraces()).toEqual([]);
  });

  it("keeps every imported curve whatever the filters, without a filter notice", async () => {
    renderTemperature();
    importFile(SAMPLE); // one TFSI row, one ClO4 row, two temperatures each
    await screen.findByText("mine.csv");

    selectFilter("Anion", "TFSI");

    expect(importedPointCount()).toBe(4);
    expect(screen.queryByText(/imported rows plotted/)).not.toBeInTheDocument();
  });

  it("still charts the imported curves when no dataset sample matches, and says so", async () => {
    renderTemperature();
    importFile(SAMPLE);
    await screen.findByText("mine.csv");

    // TFSI + water + "na" matches no dataset row.
    selectFilter("Anion", "TFSI");
    selectFilter("Solvent used", "water");
    selectFilter("crystalline?", "na");

    expect(screen.getByText("Only your imported data is shown")).toBeInTheDocument();
    expect(screen.getByText("No samples match these filters.")).toBeInTheDocument();
    expect(stubTraces().every(isImported)).toBe(true);
    expect(importedPointCount()).toBe(4);
    // Not the full-card empty state, which replaces the chart.
    expect(
      screen.queryByText("Clear a filter or two to bring series back into view."),
    ).not.toBeInTheDocument();
  });

  it("clearing removes the overlay and returns the plot to its original traces", async () => {
    renderTemperature();
    const before = stubTraces();
    importFile(SAMPLE);
    await screen.findByText("mine.csv");

    fireEvent.click(screen.getByRole("button", { name: "Clear imported data" }));

    expect(stubTraces()).toEqual(before);
    expect(stubLayout().legend2).toBeUndefined();
    expect(screen.queryByText("mine.csv")).not.toBeInTheDocument();
  });

  it("shows a file imported on the Explore page", async () => {
    render(
      <ImportedDataProvider>
        <MemoryRouter initialEntries={["/explore"]}>
          <Routes>
            <Route
              element={
                <>
                  <Link to="/temperature">Go to Temperature</Link>
                  <Outlet />
                </>
              }
            >
              <Route path="explore" element={<Explore />} />
              <Route path="temperature" element={<Temperature />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </ImportedDataProvider>,
    );
    importFile(SAMPLE);
    await screen.findByText("mine.csv");

    fireEvent.click(screen.getByRole("link", { name: "Go to Temperature" }));

    expect(await screen.findByRole("heading", { name: "Temperature" })).toBeInTheDocument();
    expect(screen.getByText("mine.csv")).toBeInTheDocument();
    expect(importedPointCount()).toBe(4);
  });
});

describe("Temperature page — y-axis", () => {
  it("defaults to conductivity on a log axis", () => {
    renderTemperature();
    const group = screen.getByRole("radiogroup", { name: "Y axis" });
    expect(within(group).getByRole("radio", { name: "σ (log axis)" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(stubLayout().yaxis).toEqual({
      type: "log",
      title: { text: "Conductivity (S cm<sup>-1</sup>)" },
    });
  });

  it("switches to log(σ / S cm⁻¹) on a linear axis, for dataset and imported rows alike", async () => {
    renderTemperature();
    importFile(SAMPLE);
    await screen.findByText("mine.csv");
    const [firstDatasetTrace] = stubTraces();
    expect(firstDatasetTrace.firstY).toBeGreaterThan(0);

    selectYAxis("log(σ / S cm⁻¹)");

    expect(stubLayout().yaxis).toEqual({
      type: "linear",
      title: { text: "log(σ / S cm<sup>-1</sup>)" },
    });
    expect(stubTraces()[0].firstY).toBe(Math.log10(firstDatasetTrace.firstY ?? NaN));
    // The TFSI row's first point: σ = 1e-5 S/cm at 30 °C.
    expect(importedTraces().find((trace) => trace.name === "TFSI")?.firstY).toBe(-5);
  });

  it("Reset to defaults puts the y-axis back to σ", () => {
    renderTemperature();
    selectYAxis("log(σ / S cm⁻¹)");
    expect(stubLayout().yaxis?.type).toBe("linear");

    fireEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));

    expect(stubLayout().yaxis?.type).toBe("log");
  });
});
