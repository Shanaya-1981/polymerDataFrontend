import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FEATURE_GLOSSARY } from "./feature-glossary";
import { FeatureGlossaryTable } from "./FeatureGlossaryTable";
import { matchesQuery } from "./matches-query";

describe("matchesQuery", () => {
  const entry = FEATURE_GLOSSARY.find((f) => f.number === 3)!; // "log Li:functional group"

  it("matches an empty query against everything", () => {
    expect(matchesQuery(entry, "")).toBe(true);
    expect(matchesQuery(entry, "   ")).toBe(true);
  });

  it("matches the feature name, case-insensitively", () => {
    expect(matchesQuery(entry, "LI:FUNCTIONAL")).toBe(true);
  });

  it("matches the description", () => {
    expect(matchesQuery(entry, "log molar salt")).toBe(true);
  });

  it("matches the literal ML column name", () => {
    expect(matchesQuery(entry, "log Li:functional group")).toBe(true);
  });

  it("matches the feature number exactly, not as a substring of another number", () => {
    expect(matchesQuery(entry, "3")).toBe(true);
    expect(matchesQuery(FEATURE_GLOSSARY.find((f) => f.number === 30)!, "3")).toBe(false);
  });

  it("does not match unrelated text", () => {
    expect(matchesQuery(entry, "mordred anion shape")).toBe(false);
  });
});

describe("FeatureGlossaryTable", () => {
  it("renders all 36 rows with no search applied", () => {
    render(<FeatureGlossaryTable />);
    expect(screen.getByText("Showing 36 of 36 features.")).toBeInTheDocument();
    expect(screen.getByText("approximate MW (kDa)")).toBeInTheDocument();
    // Row 36's feature name and mlColumn are both literally "anion nHBAcc"
    // (rendered in two separate cells), so two matches is the correct count.
    expect(screen.getAllByText("anion nHBAcc")).toHaveLength(2);
  });

  it("filters rows as the user types in the search box", () => {
    render(<FeatureGlossaryTable />);

    fireEvent.change(screen.getByLabelText("Search features"), { target: { value: "anion" } });

    expect(screen.getByText(/Showing 6 of 36 features/)).toBeInTheDocument();
    expect(screen.getAllByText("anion nHBAcc")).toHaveLength(2);
    expect(screen.queryByText("approximate MW (kDa)")).not.toBeInTheDocument();
  });

  it("matches on description text, not just the feature name", () => {
    render(<FeatureGlossaryTable />);

    fireEvent.change(screen.getByLabelText("Search features"), {
      target: { value: "drying time for solvent removal" },
    });

    // Row 4's feature name and mlColumn are both literally "drying time (h)".
    expect(screen.getAllByText("drying time (h)")).toHaveLength(2);
    expect(screen.getByText(/^Showing 1 of 36 features/)).toBeInTheDocument();
  });

  it("shows a no-results state with a working clear action", () => {
    render(<FeatureGlossaryTable />);
    const input = screen.getByLabelText("Search features");

    fireEvent.change(input, { target: { value: "not-a-real-feature" } });

    expect(screen.getByText(/No features match/)).toBeInTheDocument();
    expect(screen.getByText(/^Showing 0 of 36 features/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));

    expect(input).toHaveValue("");
    expect(screen.getByText("Showing 36 of 36 features.")).toBeInTheDocument();
  });

  it("is case-insensitive", () => {
    render(<FeatureGlossaryTable />);

    fireEvent.change(screen.getByLabelText("Search features"), { target: { value: "ANION" } });
    expect(screen.getByText(/^Showing 6 of 36 features/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search features"), { target: { value: "anion" } });
    expect(screen.getByText(/^Showing 6 of 36 features/)).toBeInTheDocument();
  });
});
