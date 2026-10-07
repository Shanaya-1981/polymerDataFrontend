import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { AxisScale } from "@/lib/log-axis";
import { AxisControl } from "./AxisControl";

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

function ControlledAxisControl({ initialColumnId = "approxTg" }: { initialColumnId?: string }) {
  const [columnId, setColumnId] = useState(initialColumnId);
  const [scale, setScale] = useState<AxisScale>("linear");
  return (
    <AxisControl
      label="X axis"
      idPrefix="test-x"
      columnId={columnId}
      onColumnChange={setColumnId}
      scale={scale}
      onScaleChange={setScale}
    />
  );
}

describe("AxisControl", () => {
  it("labels the column picker and the scale toggle for the given axis", () => {
    render(<ControlledAxisControl />);
    expect(screen.getByRole("combobox", { name: "X axis" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "X axis scale" })).toBeInTheDocument();
  });

  it("reflects the current scale as the checked radio", () => {
    render(<ControlledAxisControl />);
    const group = screen.getByRole("radiogroup", { name: "X axis scale" });
    expect(within(group).getByRole("radio", { name: "Linear" })).toHaveAttribute("aria-checked", "true");
    expect(within(group).getByRole("radio", { name: "Log" })).toHaveAttribute("aria-checked", "false");
  });

  it("calls onScaleChange when the user picks a different scale", () => {
    const onScaleChange = vi.fn();
    render(
      <AxisControl
        label="Y axis"
        idPrefix="test-y"
        columnId="approxTg"
        onColumnChange={() => {}}
        scale="linear"
        onScaleChange={onScaleChange}
      />,
    );

    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Y axis scale" })).getByRole("radio", { name: "Log" }));
    expect(onScaleChange).toHaveBeenCalledWith("log");
  });

  it("calls onColumnChange when a new column is picked from the combobox", () => {
    render(<ControlledAxisControl />);
    fireEvent.click(screen.getByRole("combobox", { name: "X axis" }));
    fireEvent.click(screen.getByRole("option", { name: "Tg" }));
    expect(screen.getByRole("combobox", { name: "X axis" })).toHaveTextContent("Tg");
  });

  it("disables the scale toggle for a categorical column and explains why", () => {
    render(<ControlledAxisControl initialColumnId="anion" />);
    const group = screen.getByRole("radiogroup", { name: "X axis scale" });
    expect(within(group).getByRole("radio", { name: "Linear" })).toBeDisabled();
    expect(within(group).getByRole("radio", { name: "Log" })).toBeDisabled();
    expect(screen.getByText(/Log scale isn't available/)).toBeInTheDocument();
  });

  it("re-enables the scale toggle when switching back to a continuous column", () => {
    render(<ControlledAxisControl initialColumnId="anion" />);
    expect(
      within(screen.getByRole("radiogroup", { name: "X axis scale" })).getByRole("radio", { name: "Log" }),
    ).toBeDisabled();

    fireEvent.click(screen.getByRole("combobox", { name: "X axis" }));
    fireEvent.click(screen.getByRole("option", { name: "Tg" }));

    expect(
      within(screen.getByRole("radiogroup", { name: "X axis scale" })).getByRole("radio", { name: "Log" }),
    ).toBeEnabled();
    expect(screen.queryByText(/Log scale isn't available/)).not.toBeInTheDocument();
  });
});
