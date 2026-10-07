import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getRow } from "@/data";
import { PointInspector } from "./PointInspector";

describe("PointInspector", () => {
  it("renders nothing when no row is selected", () => {
    const { container } = render(<PointInspector rowIndex={null} onDismiss={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the polymer name and the DOI as a real, absolute link", () => {
    const row = getRow(0);
    render(<PointInspector rowIndex={0} onDismiss={() => {}} />);

    expect(screen.getByText(row.polymer as string)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: row.doi as string });
    expect(link).toHaveAttribute("href", row.doi as string);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
  });

  it("calls onDismiss when the clear-selection affordance is used", () => {
    const onDismiss = vi.fn();
    render(<PointInspector rowIndex={0} onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("swaps to a different row's data when rowIndex changes", () => {
    // Row 37 is the first row with a different `Polymer` than row 0 — many
    // rows share a polymer/DOI (repeated measurements at different
    // temperatures), so picking two arbitrary indices risks a false pass.
    const row0 = getRow(0);
    const row37 = getRow(37);
    expect(row0.polymer).not.toBe(row37.polymer);

    const { rerender } = render(<PointInspector rowIndex={0} onDismiss={() => {}} />);
    expect(screen.getByText(row0.polymer as string)).toBeInTheDocument();

    rerender(<PointInspector rowIndex={37} onDismiss={() => {}} />);
    expect(screen.getByText(row37.polymer as string)).toBeInTheDocument();
    expect(screen.queryByText(row0.polymer as string)).not.toBeInTheDocument();
  });
});
