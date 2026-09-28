import { fireEvent, render, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearRememberedRoute, rememberedPath, useRouteMemoryRecorder } from "./route-memory";

// Real sessionStorage (jsdom provides one) persists across tests in this
// file unless cleared — and route-memory's own in-memory fallback is
// module-level state that would leak the same way. Every test below uses a
// pathname unique to itself, so cross-test leakage (through either store)
// can't produce a false pass.
beforeEach(() => {
  sessionStorage.clear();
});

function wrapper(initialPath: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[initialPath]}>{children}</MemoryRouter>;
  };
}

describe("rememberedPath", () => {
  it("returns the bare pathname when nothing has been recorded for it", () => {
    expect(rememberedPath("/never-visited")).toBe("/never-visited");
  });
});

describe("useRouteMemoryRecorder", () => {
  it("records the current location's query string, keyed by pathname, on mount", () => {
    renderHook(() => useRouteMemoryRecorder(), {
      wrapper: wrapper("/route-a?y=transferenceNumber"),
    });
    expect(rememberedPath("/route-a")).toBe("/route-a?y=transferenceNumber");
  });

  it("records a bare path as an empty search rather than leaving a stale value", () => {
    renderHook(() => useRouteMemoryRecorder(), { wrapper: wrapper("/route-b") });
    expect(rememberedPath("/route-b")).toBe("/route-b");
  });

  // This is the exact scenario from the bug report: configure /explore,
  // navigate to /temperature, navigate back to /explore. The remembered
  // entry for the page you left must still be there afterward — that's
  // what lets a nav link carry it back.
  it("keeps each pathname's own remembered search after navigating elsewhere", () => {
    function Harness() {
      useRouteMemoryRecorder();
      const navigate = useNavigate();
      return (
        <button type="button" onClick={() => navigate("/route-d?mode=VFT")}>
          go
        </button>
      );
    }

    const { getByRole } = render(
      <MemoryRouter initialEntries={["/route-c?y=transferenceNumber"]}>
        <Harness />
      </MemoryRouter>,
    );

    expect(rememberedPath("/route-c")).toBe("/route-c?y=transferenceNumber");

    fireEvent.click(getByRole("button", { name: "go" }));

    expect(rememberedPath("/route-d")).toBe("/route-d?mode=VFT");
    // The page just left behind keeps its own remembered search — a
    // second recorder mount for a different route must not clobber it.
    expect(rememberedPath("/route-c")).toBe("/route-c?y=transferenceNumber");
  });
});

describe("clearRememberedRoute", () => {
  it("forgets a pathname's remembered search, reverting rememberedPath to bare", () => {
    renderHook(() => useRouteMemoryRecorder(), { wrapper: wrapper("/route-e?z=9") });
    expect(rememberedPath("/route-e")).toBe("/route-e?z=9");

    clearRememberedRoute("/route-e");

    expect(rememberedPath("/route-e")).toBe("/route-e");
  });

  it("does not disturb a different route's remembered search", () => {
    renderHook(() => useRouteMemoryRecorder(), { wrapper: wrapper("/route-f?a=1") });
    renderHook(() => useRouteMemoryRecorder(), { wrapper: wrapper("/route-g?b=2") });

    clearRememberedRoute("/route-f");

    expect(rememberedPath("/route-f")).toBe("/route-f");
    expect(rememberedPath("/route-g")).toBe("/route-g?b=2");
  });
});

describe("when sessionStorage is unavailable", () => {
  it("degrades to in-memory storage instead of throwing, for both recording and reading", () => {
    const getItemSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked by privacy settings");
    });
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked by privacy settings");
    });
    const removeItemSpy = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("blocked by privacy settings");
    });

    try {
      expect(() =>
        renderHook(() => useRouteMemoryRecorder(), { wrapper: wrapper("/route-h?a=1") }),
      ).not.toThrow();

      // The write above went through sessionStorage.setItem, which threw —
      // this only passes if the in-memory fallback caught it.
      expect(rememberedPath("/route-h")).toBe("/route-h?a=1");

      expect(() => clearRememberedRoute("/route-h")).not.toThrow();
      expect(rememberedPath("/route-h")).toBe("/route-h");
    } finally {
      getItemSpy.mockRestore();
      setItemSpy.mockRestore();
      removeItemSpy.mockRestore();
    }
  });

  it("still works if merely reading sessionStorage.getItem throws on an otherwise-untouched key", () => {
    // Simulates a browser that blocks storage access entirely (e.g. a
    // sandboxed context), rather than one that only blocks writes.
    const getItemSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("storage disabled");
    });

    try {
      expect(() => rememberedPath("/route-i")).not.toThrow();
      expect(rememberedPath("/route-i")).toBe("/route-i");
    } finally {
      getItemSpy.mockRestore();
    }
  });
});
