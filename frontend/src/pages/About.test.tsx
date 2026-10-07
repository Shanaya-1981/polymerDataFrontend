import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import About from "./About";

// This page is a faithful port of someone else's content (see
// data/reference/page_about.json) — these assertions exist to keep that
// content, the license/funding text, and the deliberate anti-spam email
// obfuscation from being accidentally dropped or "fixed" later.
describe("About", () => {
  it("credits every original contributor", () => {
    render(<About />);
    for (const name of [
      "Nicole Schauser",
      "Gabrielle Kliegle",
      "Piper Cooke",
      "Rachel Segalman",
      "Ram Seshadri",
    ]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it("keeps the exact MRSEC funding line", () => {
    render(<About />);
    expect(
      screen.getByText(/DMR 1720256 \(IRG-2\)/, { exact: false }),
    ).toBeInTheDocument();
  });

  it("links to the MIT-licensed source repository", () => {
    render(<About />);
    const link = screen.getByRole("link", {
      name: "github.com/nschauser/PolymerElectrolyte",
    });
    expect(link).toHaveAttribute("href", "https://github.com/nschauser/PolymerElectrolyte");
  });

  it("keeps the contact email obfuscated as plain text, never a mailto: link", () => {
    render(<About />);
    expect(screen.getByText(/seshadri\[at\]mrl\.ucsb\.edu/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /seshadri/i })).not.toBeInTheDocument();
    expect(document.querySelector('a[href^="mailto:"]')).toBeNull();
  });

  it("discloses that this is an independent rebuild and links the original", () => {
    render(<About />);
    const link = screen.getByRole("link", { name: "pedatamine.org" });
    expect(link).toHaveAttribute("href", "https://pedatamine.org");
    expect(screen.getByText(/independent, modernized rebuild/i)).toBeInTheDocument();
  });

  it("does not embed a base64 image blob", () => {
    const { container } = render(<About />);
    expect(container.querySelector('img[src^="data:"]')).toBeNull();
  });
});
