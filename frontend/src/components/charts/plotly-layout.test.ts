import { describe, expect, it } from "vitest";
import type { ChartThemeTokens } from "./theme";
import { buildBaseLayout, mergeLayout } from "./plotly-layout";

const TOKENS: ChartThemeTokens = {
  surface: "#111111",
  textPrimary: "#222222",
  textSecondary: "#333333",
  borderDefault: "#444444",
  borderSubtle: "#555555",
};

describe("buildBaseLayout", () => {
  it("resolves chrome colors from the given tokens, not a hardcoded value", () => {
    const layout = buildBaseLayout(TOKENS);
    expect(layout.paper_bgcolor).toBe(TOKENS.surface);
    expect(layout.plot_bgcolor).toBe(TOKENS.surface);
    expect(layout.font?.color).toBe(TOKENS.textSecondary);
  });

  it("applies the scientific axis defaults on both axes", () => {
    const layout = buildBaseLayout(TOKENS);
    for (const axis of [layout.xaxis, layout.yaxis]) {
      expect(axis?.showgrid).toBe(false);
      expect(axis?.zeroline).toBe(false);
      expect(axis?.ticks).toBe("inside");
      expect(axis?.mirror).toBe(true);
      expect(axis?.automargin).toBe(true);
      expect(axis?.exponentformat).toBe("power");
      expect(axis?.linecolor).toBe(TOKENS.borderDefault);
    }
  });
});

describe("mergeLayout", () => {
  it("returns the base layout unchanged when there are no overrides", () => {
    const base = buildBaseLayout(TOKENS);
    expect(mergeLayout(base)).toBe(base);
  });

  it("merges xaxis/yaxis one level deep instead of replacing them wholesale", () => {
    const base = buildBaseLayout(TOKENS);
    const merged = mergeLayout(base, { xaxis: { type: "log" } });

    // The override applied...
    expect(merged.xaxis?.type).toBe("log");
    // ...without dropping the scientific defaults the base set.
    expect(merged.xaxis?.mirror).toBe(true);
    expect(merged.xaxis?.exponentformat).toBe("power");
    expect(merged.xaxis?.ticks).toBe("inside");
    // yaxis is untouched by an xaxis-only override.
    expect(merged.yaxis).toEqual(base.yaxis);
  });

  it("lets a top-level override win outright (shallow merge for everything else)", () => {
    const base = buildBaseLayout(TOKENS);
    const merged = mergeLayout(base, { hovermode: "x unified" });
    expect(merged.hovermode).toBe("x unified");
    expect(merged.paper_bgcolor).toBe(TOKENS.surface);
  });
});
