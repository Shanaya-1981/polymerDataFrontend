import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import Correlations from "./Correlations";

// Composition/wiring smoke test: the pure logic behind this page is already
// covered directly (src/lib/correlation-ranking.test.ts,
// src/pages/correlations/targets.test.ts, .../RankedCorrelationBars.test.tsx,
// .../Disclosure.test.tsx) and jsdom has no canvas/WebGL to render real
// Plotly output against, so `PlotlyChart` is stubbed here — everything else
// in the chart barrel stays real. See README.md: "A green test suite
// doesn't mean the app renders" — the browser check is what actually proves
// the matrix/ranked-list toggle and the sticky label column work.
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

function renderCorrelations() {
  return render(
    <MemoryRouter initialEntries={["/correlations"]}>
      <Correlations />
    </MemoryRouter>,
  );
}

/**
 * Both the matrix and the ranked list stay mounted at all times (only a
 * `hidden`/`block` class toggles between them — see CorrelationExplorer's
 * doc comment for why: the browser smoke test requires a Plotly figure to
 * exist even on the viewport where the ranked list is the default). jsdom
 * never loads the real stylesheet, so it has no idea that class makes
 * anything invisible — an unscoped `getByText` would just as happily match
 * a label sitting in the matrix's always-present sticky row-label column
 * (which repeats all 36 feature names). Scope every ranked-list assertion
 * to this region instead of the whole document.
 */
function rankedRegion() {
  return screen.getByRole("figure", { name: "Ranked correlations" });
}

describe("Correlations page", () => {
  it("defaults to the matrix view (jsdom has no matchMedia, so the fallback applies) with the target picker hidden", () => {
    renderCorrelations();

    const toggle = screen.getByRole("radiogroup", { name: "Correlations view" });
    expect(within(toggle).getByRole("radio", { name: "Matrix" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(within(toggle).getByRole("radio", { name: "Ranked list" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByTestId("plotly-stub")).toBeInTheDocument();
    // The target picker only makes sense for the ranked view.
    expect(screen.queryByRole("combobox", { name: "Rank against" })).not.toBeInTheDocument();
  });

  it("the explanatory prose is collapsed by default", () => {
    renderCorrelations();
    const disclosureButton = screen.getByRole("button", { name: "What am I looking at?" });
    expect(disclosureButton).toHaveAttribute("aria-expanded", "false");
    // The content is `hidden`, not unmounted (see Disclosure's doc comment
    // on aria-controls), so check visibility rather than DOM presence.
    expect(screen.getByText(/population\/sample/)).not.toBeVisible();

    fireEvent.click(disclosureButton);
    expect(disclosureButton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/population\/sample/)).toBeVisible();
  });

  it("switching to the ranked list reveals the target picker, defaulted to 60 °C, matching the documented reference values", () => {
    renderCorrelations();

    fireEvent.click(screen.getByRole("radio", { name: "Ranked list" }));

    const picker = screen.getByRole("combobox", { name: "Rank against" });
    expect(picker).toHaveTextContent("60 °C");

    // Ground truth: independently computed and verified for Conductivity at
    // 60C (see correlation-ranking.test.ts for the full table). Scoped to
    // each feature's own row — 30 of the 35 rows share n=389 at this
    // temperature, so an unscoped match would be trivially satisfied.
    const region = within(rankedRegion());
    const approxTgRow = within(region.getByText("approxTg").closest("li")!);
    expect(approxTgRow.getByText("-0.393")).toBeInTheDocument();
    expect(approxTgRow.getByText("n=302")).toBeInTheDocument();

    const anionAetaRow = within(region.getByTitle("anion AETA_eta").closest("li")!);
    expect(anionAetaRow.getByText("+0.306")).toBeInTheDocument();
    expect(anionAetaRow.getByText("n=389")).toBeInTheDocument();

    // drying vacuum is excluded from the feature-vs-conductivity table (it's
    // still named in the explanatory note, just not as a ranked bar row).
    expect(region.queryByTitle("drying vacuum")).not.toBeInTheDocument();
    expect(region.getByText("drying vacuum", { selector: "span" })).toBeInTheDocument();
    expect(region.getByText(/is not recoverable with confidence/)).toBeInTheDocument();
  });

  it("choosing a feature target ranks the other 35 features via the matrix, with one shared sample size", () => {
    renderCorrelations();
    fireEvent.click(screen.getByRole("radio", { name: "Ranked list" }));

    fireEvent.click(screen.getByRole("combobox", { name: "Rank against" }));
    // The glossary's plain-language name for mlColumn "approxTg" (feature-glossary.json).
    // Accessible name is "Approximate Tg Feature" (label + the "Feature"
    // hint TargetPicker renders alongside it), hence the partial match.
    fireEvent.click(screen.getByRole("option", { name: /Approximate Tg/ }));

    const region = within(rankedRegion());
    expect(region.getByText(/ranked by .r. against/).textContent).toContain("Approximate Tg");
    // approxTg itself must not appear as one of "the other" features.
    expect(region.queryByTitle("approxTg")).not.toBeInTheDocument();
    expect(region.getByText(/the same 271 samples/)).toBeInTheDocument();
  });

  it("toggling back to the matrix keeps the chart reachable and drops the target picker again", () => {
    renderCorrelations();
    fireEvent.click(screen.getByRole("radio", { name: "Ranked list" }));
    expect(screen.getByRole("combobox", { name: "Rank against" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Matrix" }));
    expect(screen.queryByRole("combobox", { name: "Rank against" })).not.toBeInTheDocument();
    expect(screen.getByTestId("plotly-stub")).toBeInTheDocument();
  });
});
