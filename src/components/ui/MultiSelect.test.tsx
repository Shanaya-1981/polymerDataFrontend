import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { MultiSelect, type MultiSelectOption } from "./MultiSelect";

// See Combobox.test.tsx for why this stub is needed: cmdk's <CommandList>
// calls `new ResizeObserver(...)` unconditionally on mount, and jsdom does
// not implement ResizeObserver.
class ResizeObserverStub implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = ResizeObserverStub;
}
// jsdom also doesn't implement scrollIntoView (used by cmdk to keep the
// keyboard-active item in view).
if (typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = function scrollIntoViewStub() {};
}

const OPTIONS: MultiSelectOption[] = [
  { value: "TFSI", label: "TFSI" },
  { value: "BF4", label: "BF4" },
  { value: "ClO4", label: "ClO4" },
];

function ControlledMultiSelect() {
  const [values, setValues] = useState<string[]>([]);
  return (
    <MultiSelect
      options={OPTIONS}
      values={values}
      onChange={setValues}
      placeholder="Select anions"
      searchPlaceholder="Search"
      emptyMessage="No matches"
      aria-label="Anion filter"
    />
  );
}

describe("MultiSelect", () => {
  it("shows the placeholder when nothing is selected", () => {
    render(<ControlledMultiSelect />);
    expect(screen.getByRole("combobox", { name: "Anion filter" })).toHaveTextContent(
      "Select anions",
    );
    expect(screen.queryByLabelText(/^Remove /)).not.toBeInTheDocument();
  });

  it("selects an option, keeps the popover open, and renders a chip", () => {
    render(<ControlledMultiSelect />);
    fireEvent.click(screen.getByRole("combobox", { name: "Anion filter" }));

    fireEvent.click(screen.getByRole("option", { name: "TFSI" }));

    expect(screen.getByRole("combobox", { name: "Anion filter" })).toHaveTextContent("1 selected");
    // Still open: the search box and the other options are still present.
    expect(screen.getByPlaceholderText("Search")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "BF4" })).toBeInTheDocument();
    // Chip rendered below the trigger.
    expect(screen.getByLabelText("Remove TFSI")).toBeInTheDocument();
  });

  it("accumulates multiple selections", () => {
    render(<ControlledMultiSelect />);
    fireEvent.click(screen.getByRole("combobox", { name: "Anion filter" }));

    fireEvent.click(screen.getByRole("option", { name: "TFSI" }));
    fireEvent.click(screen.getByRole("option", { name: "BF4" }));

    expect(screen.getByRole("combobox", { name: "Anion filter" })).toHaveTextContent("2 selected");
    expect(screen.getByLabelText("Remove TFSI")).toBeInTheDocument();
    expect(screen.getByLabelText("Remove BF4")).toBeInTheDocument();
  });

  it("toggles a selected option off when clicked again", () => {
    render(<ControlledMultiSelect />);
    fireEvent.click(screen.getByRole("combobox", { name: "Anion filter" }));

    fireEvent.click(screen.getByRole("option", { name: "TFSI" }));
    fireEvent.click(screen.getByRole("option", { name: "TFSI" }));

    expect(screen.getByRole("combobox", { name: "Anion filter" })).toHaveTextContent(
      "Select anions",
    );
  });

  it("removes a single selection via its chip's remove button", () => {
    render(<ControlledMultiSelect />);
    fireEvent.click(screen.getByRole("combobox", { name: "Anion filter" }));
    fireEvent.click(screen.getByRole("option", { name: "TFSI" }));
    fireEvent.click(screen.getByRole("option", { name: "BF4" }));

    fireEvent.click(screen.getByLabelText("Remove TFSI"));

    expect(screen.getByRole("combobox", { name: "Anion filter" })).toHaveTextContent("1 selected");
    expect(screen.queryByLabelText("Remove TFSI")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Remove BF4")).toBeInTheDocument();
  });

  it("clears every selection via Clear all", () => {
    render(<ControlledMultiSelect />);
    fireEvent.click(screen.getByRole("combobox", { name: "Anion filter" }));
    fireEvent.click(screen.getByRole("option", { name: "TFSI" }));
    fireEvent.click(screen.getByRole("option", { name: "BF4" }));

    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));

    expect(screen.getByRole("combobox", { name: "Anion filter" })).toHaveTextContent(
      "Select anions",
    );
    expect(screen.queryByLabelText(/^Remove /)).not.toBeInTheDocument();
  });

  it("filters the option list as the user types", () => {
    render(<ControlledMultiSelect />);
    fireEvent.click(screen.getByRole("combobox", { name: "Anion filter" }));

    fireEvent.change(screen.getByPlaceholderText("Search"), { target: { value: "BF4" } });

    expect(screen.getByRole("option", { name: "BF4" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "TFSI" })).not.toBeInTheDocument();
  });
});
