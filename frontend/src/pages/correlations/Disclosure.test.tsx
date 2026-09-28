import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Disclosure } from "./Disclosure";

describe("Disclosure", () => {
  it("is collapsed by default: the button reports aria-expanded=false and the content is hidden", () => {
    render(
      <Disclosure summary="What am I looking at?">
        <p>Hidden by default.</p>
      </Disclosure>,
    );
    const button = screen.getByRole("button", { name: "What am I looking at?" });
    expect(button).toHaveAttribute("aria-expanded", "false");

    const content = screen.getByText("Hidden by default.");
    expect(content).not.toBeVisible();
  });

  it("opens on click, exposing the content and flipping aria-expanded", () => {
    render(
      <Disclosure summary="What am I looking at?">
        <p>Now visible.</p>
      </Disclosure>,
    );
    fireEvent.click(screen.getByRole("button", { name: "What am I looking at?" }));

    expect(screen.getByRole("button", { name: "What am I looking at?" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByText("Now visible.")).toBeVisible();
  });

  it("closes again on a second click", () => {
    render(
      <Disclosure summary="Toggle me">
        <p>Content</p>
      </Disclosure>,
    );
    const button = screen.getByRole("button", { name: "Toggle me" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Content")).not.toBeVisible();
  });

  it("respects defaultOpen", () => {
    render(
      <Disclosure summary="Already open" defaultOpen>
        <p>Visible immediately.</p>
      </Disclosure>,
    );
    expect(screen.getByRole("button", { name: "Already open" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByText("Visible immediately.")).toBeVisible();
  });

  it("the button's aria-controls points at the content region's id", () => {
    render(
      <Disclosure summary="Linked">
        <p>Content</p>
      </Disclosure>,
    );
    const button = screen.getByRole("button", { name: "Linked" });
    const controlsId = button.getAttribute("aria-controls");
    expect(controlsId).toBeTruthy();
    expect(document.getElementById(controlsId ?? "")).toContainElement(screen.getByText("Content"));
  });
});
