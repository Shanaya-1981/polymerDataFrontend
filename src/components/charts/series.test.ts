import { describe, expect, it } from "vitest";
import {
  CHART_PALETTE,
  MAX_CATEGORICAL_SLOTS,
  OTHER_SLOT,
  SERIES_SYMBOLS,
} from "@/styles/chart-palette";
import type { Data } from "./plotly";
import {
  buildCategoricalScatterTraces,
  buildContinuousScatterTrace,
  buildCorrelationHeatmapTrace,
  buildNullSeparatedGroups,
  buildScatterTraces,
  buildTemperatureLineTraces,
  resolveSlotColor,
  type CategoricalPoint,
  type ContinuousPoint,
  type LineSample,
} from "./series";

// `Data` is Plotly's own huge generated trace union (40+ trace types, every
// field optional). These tests know exactly which concrete shape each
// builder produces, so they read through a narrow local view instead of
// fighting the union — the same "define the minimal shape you need" pattern
// this file's own header comment applies to the not-yet-existing data layer.
interface MarkerShape {
  color: unknown;
  symbol?: unknown;
  size?: number;
  colorscale?: unknown;
  showscale?: boolean;
  colorbar?: { title?: { text?: string } };
}
interface ScatterTraceShape {
  type: string;
  mode: string;
  name?: string;
  x: unknown[];
  y: unknown[];
  customdata: unknown[];
  marker: MarkerShape;
}
interface LineTraceShape {
  type: string;
  mode: string;
  name?: string;
  x: (number | null)[];
  y: (number | null)[];
  customdata: (number | null)[];
  line: { color: string; width?: number };
  connectgaps?: boolean;
}
interface HeatmapTraceShape {
  type: string;
  x: unknown[];
  y: unknown[];
  z: number[][];
  zmin: number;
  zmid: number;
  zmax: number;
  colorscale: [number, string][];
}

function shape<T>(trace: Data): T {
  return trace as unknown as T;
}

describe("resolveSlotColor", () => {
  it("resolves named slots to that slot's concrete hex, per mode", () => {
    expect(resolveSlotColor(0, "light")).toBe(CHART_PALETTE[0].light);
    expect(resolveSlotColor(0, "dark")).toBe(CHART_PALETTE[0].dark);
    expect(resolveSlotColor(6, "light")).toBe(CHART_PALETTE[6].light);
    expect(resolveSlotColor(6, "dark")).toBe(CHART_PALETTE[6].dark);
  });

  it("folds ranks at or beyond MAX_CATEGORICAL_SLOTS into OTHER_SLOT, never cycling", () => {
    expect(resolveSlotColor(MAX_CATEGORICAL_SLOTS, "light")).toBe(OTHER_SLOT.light);
    expect(resolveSlotColor(MAX_CATEGORICAL_SLOTS, "dark")).toBe(OTHER_SLOT.dark);
    expect(resolveSlotColor(100, "light")).toBe(OTHER_SLOT.light);
  });

  it("folds a negative rank into OTHER_SLOT too", () => {
    expect(resolveSlotColor(-1, "light")).toBe(OTHER_SLOT.light);
  });
});

describe("buildCategoricalScatterTraces", () => {
  const points: CategoricalPoint[] = [
    { x: 1, y: 10, rank: 0, category: "TFSI", rowIndex: 0 },
    { x: 2, y: 20, rank: 1, category: "BF4", rowIndex: 1 },
    { x: 3, y: 30, rank: 0, category: "TFSI", rowIndex: 2 },
    { x: 4, y: 40, rank: 9, category: "RareAnionA", rowIndex: 3 },
    { x: 5, y: 50, rank: 12, category: "RareAnionB", rowIndex: 4 },
  ];

  it("groups points by slot, in ascending rank order, folding out-of-range ranks into one trailing Other trace", () => {
    const traces = buildCategoricalScatterTraces(points, "light").map((t) =>
      shape<ScatterTraceShape>(t),
    );

    expect(traces).toHaveLength(3);

    expect(traces[0].name).toBe("TFSI");
    expect(traces[0].x).toEqual([1, 3]);
    expect(traces[0].y).toEqual([10, 30]);
    expect(traces[0].customdata).toEqual([0, 2]);
    expect(traces[0].marker.color).toBe(CHART_PALETTE[0].light);
    expect(traces[0].marker.symbol).toBe(SERIES_SYMBOLS[0]);

    expect(traces[1].name).toBe("BF4");
    expect(traces[1].x).toEqual([2]);
    expect(traces[1].customdata).toEqual([1]);
    expect(traces[1].marker.color).toBe(CHART_PALETTE[1].light);
    expect(traces[1].marker.symbol).toBe(SERIES_SYMBOLS[1]);

    // Both out-of-range ranks (9 and 12) fold into the SAME trailing trace,
    // never a second/third "extra" trace, and never one named after either
    // original category.
    expect(traces[2].name).toBe("Other");
    expect(traces[2].x).toEqual([4, 5]);
    expect(traces[2].y).toEqual([40, 50]);
    expect(traces[2].customdata).toEqual([3, 4]);
    expect(traces[2].marker.color).toBe(OTHER_SLOT.light);
    expect(traces[2].marker.symbol).toBe(SERIES_SYMBOLS[MAX_CATEGORICAL_SLOTS]);
  });

  it("never emits more than MAX_CATEGORICAL_SLOTS + 1 traces regardless of input order", () => {
    const scrambled: CategoricalPoint[] = [
      { x: 1, y: 1, rank: 3, category: "c3", rowIndex: 0 },
      { x: 1, y: 1, rank: 20, category: "far-over", rowIndex: 1 },
      { x: 1, y: 1, rank: 0, category: "c0", rowIndex: 2 },
      { x: 1, y: 1, rank: 7, category: "just-over", rowIndex: 3 },
    ];
    const traces = buildCategoricalScatterTraces(scrambled, "light").map((t) =>
      shape<ScatterTraceShape>(t),
    );
    // ranks 0 and 3 get their own trace; 7 and 20 fold together => 3 traces.
    expect(traces).toHaveLength(3);
    expect(traces.map((t) => t.name)).toEqual(["c0", "c3", "Other"]);
  });

  it("uses dark-mode hex when mode is dark", () => {
    const [trace] = buildCategoricalScatterTraces(points, "dark").map((t) =>
      shape<ScatterTraceShape>(t),
    );
    expect(trace.marker.color).toBe(CHART_PALETTE[0].dark);
  });

  it("defaults to SVG scatter traces with an 7px marker, both overridable", () => {
    const defaults = buildCategoricalScatterTraces(points, "light").map((t) =>
      shape<ScatterTraceShape>(t),
    );
    expect(defaults.every((t) => t.type === "scatter")).toBe(true);
    expect(defaults.every((t) => t.marker.size === 7)).toBe(true);

    const customized = buildCategoricalScatterTraces(points, "light", {
      traceType: "scattergl",
      markerSize: 12,
    }).map((t) => shape<ScatterTraceShape>(t));
    expect(customized.every((t) => t.type === "scattergl")).toBe(true);
    expect(customized.every((t) => t.marker.size === 12)).toBe(true);
  });
});

describe("buildContinuousScatterTrace", () => {
  const points: ContinuousPoint[] = [
    { x: 1, y: 2, colorValue: 0.5, rowIndex: 0 },
    { x: 2, y: 3, colorValue: null, rowIndex: 1 },
    { x: 3, y: 4, colorValue: 1.2, rowIndex: 2 },
  ];

  it("builds exactly one trace with the color column bound to marker.color and a sequential colorscale", () => {
    const trace = shape<ScatterTraceShape>(buildContinuousScatterTrace(points));

    expect(trace.type).toBe("scatter");
    expect(trace.mode).toBe("markers");
    expect(trace.x).toEqual([1, 2, 3]);
    expect(trace.y).toEqual([2, 3, 4]);
    expect(trace.customdata).toEqual([0, 1, 2]);
    expect(trace.marker.color).toEqual([0.5, null, 1.2]);
    expect(trace.marker.colorscale).toBe("Viridis");
    expect(trace.marker.showscale).toBe(true);
    expect(trace.marker.symbol).toBeUndefined();
  });

  it("only sets a colorbar title when one is provided", () => {
    const untitled = shape<ScatterTraceShape>(buildContinuousScatterTrace(points));
    expect(untitled.marker.colorbar).toBeUndefined();

    const titled = shape<ScatterTraceShape>(
      buildContinuousScatterTrace(points, { colorAxisTitle: "Tg (°C)" }),
    );
    expect(titled.marker.colorbar?.title?.text).toBe("Tg (°C)");
  });
});

describe("buildScatterTraces (categorical vs continuous dispatch)", () => {
  const categoricalPoints: CategoricalPoint[] = [
    { x: 1, y: 1, rank: 0, category: "TFSI", rowIndex: 0 },
    { x: 2, y: 2, rank: 1, category: "BF4", rowIndex: 1 },
  ];
  const continuousPoints: ContinuousPoint[] = [
    { x: 1, y: 1, colorValue: 0.1, rowIndex: 0 },
    { x: 2, y: 2, colorValue: 0.9, rowIndex: 1 },
  ];

  it("routes kind: 'categorical' to many symbol-bearing traces", () => {
    const traces = buildScatterTraces(
      { kind: "categorical", points: categoricalPoints },
      "light",
    ).map((t) => shape<ScatterTraceShape>(t));
    expect(traces).toHaveLength(2);
    expect(traces.every((t) => t.marker.symbol !== undefined)).toBe(true);
    expect(traces.every((t) => t.marker.colorscale === undefined)).toBe(true);
  });

  it("routes kind: 'continuous' to a single colorscale-bearing trace", () => {
    const traces = buildScatterTraces(
      { kind: "continuous", points: continuousPoints },
      "light",
    ).map((t) => shape<ScatterTraceShape>(t));
    expect(traces).toHaveLength(1);
    expect(traces[0].marker.colorscale).toBe("Viridis");
    expect(traces[0].marker.symbol).toBeUndefined();
  });
});

describe("buildNullSeparatedGroups", () => {
  it("concatenates same-slot samples with null separators, keeping customdata aligned to x/y at every index", () => {
    const samples: LineSample[] = [
      { x: [1, 2], y: [10, 20], rank: 0, category: "TFSI", rowIndex: 101 },
      { x: [3, 4, 5], y: [30, 40, 50], rank: 0, category: "TFSI", rowIndex: 202 },
      { x: [6, 7], y: [60, 70], rank: 0, category: "TFSI", rowIndex: 303 },
    ];

    const groups = buildNullSeparatedGroups(samples);
    expect(groups).toHaveLength(1);
    const group = groups[0];

    expect(group.key).toBe(0);
    expect(group.label).toBe("TFSI");
    expect(group.x).toEqual([1, 2, null, 3, 4, 5, null, 6, 7]);
    expect(group.y).toEqual([10, 20, null, 30, 40, 50, null, 60, 70]);
    // The whole point: a clicked point's array index must map back to the
    // correct *source row*, not just "some" row — every real (non-null)
    // slot carries its own sample's rowIndex, and every null slot in x/y
    // has a matching null in customdata (never a stray number).
    expect(group.customdata).toEqual([101, 101, null, 202, 202, 202, null, 303, 303]);

    // Alignment invariant: null appears in x, y, and customdata at exactly
    // the same indices — this is what makes `customdata[i]` a safe read for
    // any index Plotly could report from a click event.
    for (let i = 0; i < group.x.length; i += 1) {
      const isSeparator = group.x[i] === null;
      expect(group.y[i] === null).toBe(isSeparator);
      expect(group.customdata[i] === null).toBe(isSeparator);
    }
  });

  it("keeps different-slot samples in separate groups with no separators needed", () => {
    const samples: LineSample[] = [
      { x: [1], y: [1], rank: 0, category: "TFSI", rowIndex: 1 },
      { x: [2], y: [2], rank: 3, category: "ClO4", rowIndex: 2 },
    ];

    const groups = buildNullSeparatedGroups(samples);
    expect(groups.map((g) => g.key)).toEqual([0, 3]);
    expect(groups[0]).toMatchObject({ label: "TFSI", x: [1], customdata: [1] });
    expect(groups[1]).toMatchObject({ label: "ClO4", x: [2], customdata: [2] });
  });

  it("folds every out-of-range rank into one shared Other group", () => {
    const samples: LineSample[] = [
      { x: [1], y: [1], rank: 7, category: "a", rowIndex: 10 },
      { x: [2], y: [2], rank: 9, category: "b", rowIndex: 11 },
      { x: [3], y: [3], rank: 20, category: "c", rowIndex: 12 },
    ];

    const groups = buildNullSeparatedGroups(samples);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe(MAX_CATEGORICAL_SLOTS);
    expect(groups[0].label).toBe("Other");
    expect(groups[0].x).toEqual([1, null, 2, null, 3]);
    expect(groups[0].customdata).toEqual([10, null, 11, null, 12]);
  });

  it("skips zero-length samples without inserting a stray separator for them", () => {
    const samples: LineSample[] = [
      { x: [1, 2], y: [10, 20], rank: 0, category: "TFSI", rowIndex: 1 },
      { x: [], y: [], rank: 0, category: "TFSI", rowIndex: 2 },
      { x: [3, 4], y: [30, 40], rank: 0, category: "TFSI", rowIndex: 3 },
    ];

    const group = buildNullSeparatedGroups(samples)[0];
    // Exactly one separator (between rowIndex 1 and rowIndex 3) — the empty
    // sample in between contributes nothing, not an extra null.
    expect(group.x).toEqual([1, 2, null, 3, 4]);
    expect(group.customdata).toEqual([1, 1, null, 3, 3]);
  });

  it("sorts groups ascending by key with Other always last, regardless of input order", () => {
    const samples: LineSample[] = [
      { x: [1], y: [1], rank: 5, category: "e", rowIndex: 1 },
      { x: [1], y: [1], rank: 8, category: "other-ish", rowIndex: 2 },
      { x: [1], y: [1], rank: 0, category: "a", rowIndex: 3 },
    ];
    const groups = buildNullSeparatedGroups(samples);
    expect(groups.map((g) => g.key)).toEqual([0, 5, MAX_CATEGORICAL_SLOTS]);
  });

  it("throws when a sample's x and y lengths disagree, rather than silently misaligning", () => {
    const samples: LineSample[] = [{ x: [1, 2], y: [1], rank: 0, category: "TFSI", rowIndex: 42 }];
    expect(() => buildNullSeparatedGroups(samples)).toThrow(/rowIndex 42/);
  });
});

describe("buildTemperatureLineTraces", () => {
  const samples: LineSample[] = [
    { x: [1, 2], y: [10, 20], rank: 0, category: "TFSI", rowIndex: 1 },
    { x: [3], y: [30], rank: 3, category: "ClO4", rowIndex: 2 },
  ];

  it("emits one line trace per null-separated group, colored via resolveSlotColor", () => {
    const groups = buildNullSeparatedGroups(samples);
    const traces = buildTemperatureLineTraces(samples, "light").map((t) =>
      shape<LineTraceShape>(t),
    );

    expect(traces).toHaveLength(groups.length);
    traces.forEach((trace, i) => {
      expect(trace.mode).toBe("lines");
      expect(trace.type).toBe("scatter");
      expect(trace.connectgaps).toBe(false);
      expect(trace.name).toBe(groups[i].label);
      expect(trace.x).toEqual(groups[i].x);
      expect(trace.y).toEqual(groups[i].y);
      expect(trace.customdata).toEqual(groups[i].customdata);
      expect(trace.line.color).toBe(resolveSlotColor(groups[i].key, "light"));
    });
  });

  it("respects a traceType override and dark mode", () => {
    const [trace] = buildTemperatureLineTraces(samples, "dark", { traceType: "scattergl" }).map(
      (t) => shape<LineTraceShape>(t),
    );
    expect(trace.type).toBe("scattergl");
    expect(trace.line.color).toBe(resolveSlotColor(0, "dark"));
  });
});

describe("buildCorrelationHeatmapTrace", () => {
  const matrix = {
    labels: ["A", "B", "C"],
    z: [
      [1, 0.5, -0.2],
      [0.5, 1, 0.1],
      [-0.2, 0.1, 1],
    ],
  };

  it("is a single heatmap trace with a symmetric domain pinned at 0", () => {
    const trace = shape<HeatmapTraceShape>(buildCorrelationHeatmapTrace(matrix, "light"));
    expect(trace.type).toBe("heatmap");
    expect(trace.x).toEqual(matrix.labels);
    expect(trace.y).toEqual(matrix.labels);
    expect(trace.z).toEqual(matrix.z);
    expect(trace.zmin).toBe(-1);
    expect(trace.zmid).toBe(0);
    expect(trace.zmax).toBe(1);
  });

  it("uses a diverging scale built from validated categorical hues plus a neutral gray midpoint, never a sequential scale", () => {
    const light = shape<HeatmapTraceShape>(buildCorrelationHeatmapTrace(matrix, "light"));
    expect(light.colorscale).toEqual([
      [0, CHART_PALETTE[1].light],
      [0.5, "#8c8c95"],
      [1, CHART_PALETTE[0].light],
    ]);

    const dark = shape<HeatmapTraceShape>(buildCorrelationHeatmapTrace(matrix, "dark"));
    expect(dark.colorscale).toEqual([
      [0, CHART_PALETTE[1].dark],
      [0.5, "#68686f"],
      [1, CHART_PALETTE[0].dark],
    ]);
  });
});
