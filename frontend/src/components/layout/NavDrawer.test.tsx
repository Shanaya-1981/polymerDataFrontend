import { act, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { NavDrawer } from "./NavDrawer";

/**
 * Harness that deliberately passes an INLINE (unmemoized) `onClose` and can be
 * forced to re-render. This reproduces the original focus-stealing bug: the
 * focus-trap effect used to list `onClose` in its dependency array, so a new
 * closure on each parent render tore the trap down (restoring focus to the
 * trigger) and immediately rebuilt it (focusing the first link) — yanking
 * focus away from whatever the user had tabbed to.
 */
function Harness() {
  const [open, setOpen] = useState(true);
  const [, forceRender] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <MemoryRouter>
      <button ref={triggerRef} type="button">
        Open menu
      </button>
      <button type="button" onClick={() => forceRender((n) => n + 1)}>
        Force re-render
      </button>
      <NavDrawer open={open} onClose={() => setOpen(false)} triggerRef={triggerRef} />
    </MemoryRouter>
  );
}

describe("NavDrawer", () => {
  it("renders as a modal dialog and moves focus inside on open", () => {
    render(<Harness />);

    const dialog = screen.getByRole("dialog", { name: "Navigation" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });

  it("locks body scroll while open and releases it on unmount", () => {
    const { unmount } = render(<Harness />);
    expect(document.body.style.overflow).toBe("hidden");

    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("restores focus to the trigger when closed", () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open menu" });

    act(() => {
      screen.getByRole("button", { name: "Close menu" }).click();
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps focus where the user put it across an unrelated parent re-render", () => {
    render(<Harness />);

    // Tab target: pick a link that is NOT the one auto-focused on open.
    const links = screen.getAllByRole("link");
    const target = links[links.length - 1];
    target.focus();
    expect(document.activeElement).toBe(target);

    // An unrelated state change in the parent re-renders NavDrawer with a
    // brand-new onClose closure. Focus must not move.
    act(() => {
      screen.getByRole("button", { name: "Force re-render" }).click();
    });

    expect(document.activeElement).toBe(target);
  });

  it("renders nothing when closed", () => {
    const triggerRef = { current: null };
    render(
      <MemoryRouter>
        <NavDrawer open={false} onClose={() => {}} triggerRef={triggerRef} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
