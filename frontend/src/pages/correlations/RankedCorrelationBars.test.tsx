import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RankedCorrelationBars } from "./RankedCorrelationBars";
import type { RankedCorrelation } from "@/lib/correlation-ranking";

describe("RankedCorrelationBars", () => {
  it("renders one row per entry, in the given (already-ranked) order", () => {
    const entries: RankedCorrelation[] = [
      { label: "approxTg", r: -0.393, n: 302 },
      { label: "anion nO", r: 0.237, n: 389 },
    ];
    render(<RankedCorrelationBars entries={entries} />);

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("approxTg");
    expect(rows[1]).toHaveTextContent("anion nO");
  });

  it("prints a signed r (explicit + for positive) and the raw n for every row", () => {
    const entries: RankedCorrelation[] = [
      { label: "anion nO", r: 0.237, n: 389 },
      { label: "approxTg", r: -0.393, n: 302 },
    ];
    render(<RankedCorrelationBars entries={entries} />);

    expect(screen.getByText("+0.237")).toBeInTheDocument();
    expect(screen.getByText("-0.393")).toBeInTheDocument();
    expect(screen.getByText("n=389")).toBeInTheDocument();
    expect(screen.getByText("n=302")).toBeInTheDocument();
  });

  it("exposes the full (unabbreviated) label via title for a11y/tooltip purposes", () => {
    const entries: RankedCorrelation[] = [{ label: "Comonomer1 AETA_beta_ns", r: 0.5, n: 100 }];
    render(<RankedCorrelationBars entries={entries} />);
    expect(screen.getByTitle("Comonomer1 AETA_beta_ns")).toBeInTheDocument();
  });

  it("shows an info notice instead of an empty list when there is nothing to rank", () => {
    render(<RankedCorrelationBars entries={[]} />);
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByText(/No correlations are available/)).toBeInTheDocument();
  });
});
