import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Combobox, type ComboboxOption } from "./Combobox";

// jsdom has no ResizeObserver. cmdk's <CommandList> observes its own height
// unconditionally (to expose a --cmdk-list-height CSS variable), so opening
// the popover throws `ReferenceError: ResizeObserver is not defined` without
// this stub. (@floating-ui, which Radix Popover uses for positioning,
// feature-detects instead and degrades gracefully — this gap is cmdk-only.)
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

const OPTIONS: ComboboxOption[] = [
  { value: "approxTg", label: "approxTg" },
  { value: "Tg", label: "Tg" },
  { value: "Conductivity at 60C", label: "Conductivity at 60C" },
  { value: "Polymer family", label: "Polymer family" },
];

function ControlledCombobox() {
  const [value, setValue] = useState<string | null>(null);
  return (
    <Combobox
      options={OPTIONS}
      value={value}
      onChange={setValue}
      placeholder="Select a column"
      searchPlaceholder="Search"
      emptyMessage="No matches"
      aria-label="Y axis"
    />
  );
}

describe("Combobox", () => {
  it("is closed by default and shows the placeholder", () => {
    render(
      <Combobox
        options={OPTIONS}
        value={null}
        onChange={() => {}}
        placeholder="Select a column"
        aria-label="Y axis"
      />,
    );

    const trigger = screen.getByRole("combobox", { name: "Y axis" });
    expect(trigger).toHaveTextContent("Select a column");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("opens on click and lists every option", () => {
    render(
      <Combobox
        options={OPTIONS}
        value={null}
        onChange={() => {}}
        searchPlaceholder="Search"
        aria-label="Y axis"
      />,
    );

    fireEvent.click(screen.getByRole("combobox", { name: "Y axis" }));

    expect(screen.getByRole("combobox", { name: "Y axis" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByPlaceholderText("Search")).toBeInTheDocument();
    for (const option of OPTIONS) {
      expect(screen.getByRole("option", { name: option.label })).toBeInTheDocument();
    }
  });

  it("filters options as the user types", () => {
    render(
      <Combobox
        options={OPTIONS}
        value={null}
        onChange={() => {}}
        searchPlaceholder="Search"
        aria-label="Y axis"
      />,
    );
    fireEvent.click(screen.getByRole("combobox", { name: "Y axis" }));

    fireEvent.change(screen.getByPlaceholderText("Search"), { target: { value: "Polymer" } });

    expect(screen.getByRole("option", { name: "Polymer family" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Conductivity at 60C" })).not.toBeInTheDocument();
  });

  it("shows the empty message when nothing matches", () => {
    render(
      <Combobox
        options={OPTIONS}
        value={null}
        onChange={() => {}}
        searchPlaceholder="Search"
        emptyMessage="No matches"
        aria-label="Y axis"
      />,
    );
    fireEvent.click(screen.getByRole("combobox", { name: "Y axis" }));

    fireEvent.change(screen.getByPlaceholderText("Search"), { target: { value: "zzz-nope" } });

    expect(screen.getByText("No matches")).toBeInTheDocument();
  });

  it("calls onChange with the option's value and closes the popover", () => {
    const onChange = vi.fn();
    render(
      <Combobox
        options={OPTIONS}
        value={null}
        onChange={onChange}
        searchPlaceholder="Search"
        aria-label="Y axis"
      />,
    );
    fireEvent.click(screen.getByRole("combobox", { name: "Y axis" }));

    fireEvent.click(screen.getByRole("option", { name: "Polymer family" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("Polymer family");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("reflects the newly-selected option once the caller feeds the value back in", () => {
    render(<ControlledCombobox />);

    fireEvent.click(screen.getByRole("combobox", { name: "Y axis" }));
    fireEvent.click(screen.getByRole("option", { name: "Tg" }));

    expect(screen.getByRole("combobox", { name: "Y axis" })).toHaveTextContent("Tg");
  });

  it("selects the active (searched-down-to-one) option with Enter", () => {
    const onChange = vi.fn();
    render(
      <Combobox
        options={OPTIONS}
        value={null}
        onChange={onChange}
        searchPlaceholder="Search"
        aria-label="Y axis"
      />,
    );
    fireEvent.click(screen.getByRole("combobox", { name: "Y axis" }));

    const search = screen.getByPlaceholderText("Search");
    fireEvent.change(search, { target: { value: "Polymer family" } });
    fireEvent.keyDown(search, { key: "Enter" });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("Polymer family");
  });
});
