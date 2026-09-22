import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { useRouteMemoryRecorder } from "@/lib/route-memory";
import { Nav } from "./Nav";

beforeEach(() => {
  sessionStorage.clear();
});

function Harness() {
  useRouteMemoryRecorder();
  const location = useLocation();
  return (
    <>
      <div data-testid="current-location">{location.pathname + location.search}</div>
      <Nav />
    </>
  );
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Harness />
    </MemoryRouter>,
  );
}

describe("Nav", () => {
  it("points each link at the bare pathname when nothing is remembered", () => {
    renderAt("/");
    expect(screen.getByRole("link", { name: "Explore" })).toHaveAttribute("href", "/explore");
    expect(screen.getByRole("link", { name: "Temperature" })).toHaveAttribute(
      "href",
      "/temperature",
    );
  });

  // The recorder writes in a `useEffect`, so a value it just wrote during
  // one render can't be read back within that *same* render — it only
  // becomes visible on Nav's next render. That's exactly the real app's
  // timing too: the effect from mounting at /explore?y=... always finishes
  // (synchronously, well before any further user input is even possible)
  // before the *next* click causes Nav to re-render and re-read it. So this
  // test reproduces the bug report's own sequence — configure a view, then
  // click to another tab — rather than asserting immediately after mount.
  it("carries a remembered query string once a later navigation lets Nav catch up", () => {
    renderAt("/explore?y=transferenceNumber");
    fireEvent.click(screen.getByRole("link", { name: "Temperature" }));

    expect(screen.getByRole("link", { name: "Explore" })).toHaveAttribute(
      "href",
      "/explore?y=transferenceNumber",
    );
    // A route nothing was recorded for is untouched.
    expect(screen.getByRole("link", { name: "Data" })).toHaveAttribute("href", "/data");
  });

  it("actually restores the remembered view when the nav link is followed back — the bug's own repro", () => {
    renderAt("/explore?y=transferenceNumber");
    fireEvent.click(screen.getByRole("link", { name: "Temperature" }));
    // Before the fix, this landed on bare /explore (see this file's header
    // comment on why the assertion has to be after a click, not before).
    fireEvent.click(screen.getByRole("link", { name: "Explore" }));

    expect(screen.getByTestId("current-location")).toHaveTextContent(
      "/explore?y=transferenceNumber",
    );
  });

  it("keeps active-route highlighting and aria-current keyed on pathname when the active link's own href carries a query string", () => {
    renderAt("/explore?y=transferenceNumber");
    fireEvent.click(screen.getByRole("link", { name: "Temperature" }));
    fireEvent.click(screen.getByRole("link", { name: "Explore" }));

    const exploreLink = screen.getByRole("link", { name: "Explore" });
    expect(exploreLink).toHaveAttribute("href", "/explore?y=transferenceNumber");
    expect(exploreLink).toHaveAttribute("aria-current", "page");

    const temperatureLink = screen.getByRole("link", { name: "Temperature" });
    expect(temperatureLink).not.toHaveAttribute("aria-current");
  });

  // Regression: the active route's remembered value is always one render
  // behind, because the recorder writes it in an effect that runs after Nav
  // renders. Reading storage for the active link therefore handed it a stale
  // search, and clicking the tab you were already on right after changing a
  // control silently reset the page. The active link must use the live
  // location instead. Caught in a browser, not by the suite.
  it("points the active route's own link at the live URL, not a stale remembered one", () => {
    renderAt("/explore?y=transferenceNumber");

    expect(screen.getByRole("link", { name: "Explore" })).toHaveAttribute(
      "href",
      "/explore?y=transferenceNumber",
    );
  });

  it("calls onNavigate when a link is activated (mobile drawer close-on-click)", () => {
    let closed = false;
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Nav onNavigate={() => (closed = true)} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("link", { name: "Explore" }));
    expect(closed).toBe(true);
  });
});
