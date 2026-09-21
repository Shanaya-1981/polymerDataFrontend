import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageHeader } from "./PageHeader";

// Trivial smoke test: proves the Vitest + jsdom + React Testing Library
// pipeline works end to end. Later waves add real coverage for their own
// components.
describe("PageHeader", () => {
  it("renders the title and description", () => {
    render(<PageHeader title="Explore" description="Plot conductivity data." />);

    expect(screen.getByRole("heading", { name: "Explore" })).toBeInTheDocument();
    expect(screen.getByText("Plot conductivity data.")).toBeInTheDocument();
  });
});
