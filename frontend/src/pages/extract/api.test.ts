import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ExtractApiError,
  fetchJobStatus,
  isAbortError,
  parseJobStatus,
  startExtraction,
} from "./api";

const API = "http://api.test";
const pdf = new File(["%PDF-1.4"], "paper.pdf", { type: "application/pdf" });

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function stubFetch(respond: () => Response | Promise<Response>) {
  const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
    Promise.resolve().then(respond),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function rejection(promise: Promise<unknown>): Promise<ExtractApiError> {
  const error = await promise.then(
    () => {
      throw new Error("expected a rejection");
    },
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ExtractApiError);
  return error as ExtractApiError;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("startExtraction", () => {
  it("POSTs the PDF and the features as one comma-separated field, and returns the job id", async () => {
    const fetchMock = stubFetch(() => json({ job: "07561dd6" }, 202));

    const job = await startExtraction(API, pdf, ["Temperature (°C)", "Conductivity (S/cm)"]);

    expect(job).toBe("07561dd6");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API}/extract`);
    expect(init?.method).toBe("POST");
    const form = init?.body as FormData;
    expect((form.get("pdf") as File).name).toBe("paper.pdf");
    expect(form.get("features")).toBe("Temperature (°C), Conductivity (S/cm)");
  });

  it("turns a 400 into a `rejected` error carrying the server's reason", async () => {
    stubFetch(() => json({ detail: "The uploaded file isn't a PDF." }, 400));
    const error = await rejection(startExtraction(API, pdf, ["Tg"]));
    expect(error.kind).toBe("rejected");
    expect(error.message).toBe("The uploaded file isn't a PDF.");
    expect(error.status).toBe(400);
  });

  it("still explains a 400 that gives no reason", async () => {
    stubFetch(() => new Response("Bad Request", { status: 400 }));
    const error = await rejection(startExtraction(API, pdf, ["Tg"]));
    expect(error.kind).toBe("rejected");
    expect(error.message).toBe("The server refused the request.");
  });

  it("reports any other error status, with FastAPI's detail when there is one", async () => {
    stubFetch(() => new Response("<h1>Bad Gateway</h1>", { status: 502 }));
    const bare = await rejection(startExtraction(API, pdf, ["Tg"]));
    expect(bare).toMatchObject({ kind: "http", status: 502, message: "HTTP 502" });

    stubFetch(() => json({ detail: "Something broke" }, 500));
    const detailed = await rejection(startExtraction(API, pdf, ["Tg"]));
    expect(detailed).toMatchObject({ kind: "http", status: 500, message: "Something broke" });
  });

  it("flags a success that isn't JSON, or has no job id, as unreadable", async () => {
    stubFetch(() => new Response("<!doctype html><title>Vite</title>", { status: 200 }));
    const html = await rejection(startExtraction(API, pdf, ["Tg"]));
    expect(html.kind).toBe("bad-response");
    expect(html.message).toContain("isn't JSON");

    stubFetch(() => json({ id: "no-job-field" }, 202));
    const shape = await rejection(startExtraction(API, pdf, ["Tg"]));
    expect(shape.kind).toBe("bad-response");
  });

  it("turns a request that never gets an answer into a `network` error", async () => {
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    const error = await rejection(startExtraction(API, pdf, ["Tg"]));
    expect(error).toMatchObject({ kind: "network", message: "Failed to fetch" });
  });

  it("lets a cancellation through as-is, so callers can ignore it", async () => {
    stubFetch(() => Promise.reject(new DOMException("The operation was aborted.", "AbortError")));
    const error = await startExtraction(API, pdf, ["Tg"]).catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(ExtractApiError);
    expect(isAbortError(error)).toBe(true);
  });
});

describe("fetchJobStatus", () => {
  it("asks about the job at /extract/<id>, encoding the id", async () => {
    const fetchMock = stubFetch(() => json({ status: "running" }));
    expect(await fetchJobStatus(API, "a b/c")).toEqual({ status: "running" });
    expect(fetchMock.mock.calls[0][0]).toBe(`${API}/extract/a%20b%2Fc`);
  });

  it("returns a failed job's reason, or says there wasn't one", async () => {
    stubFetch(() => json({ status: "failed", error: "claude: usage limit reached" }));
    expect(await fetchJobStatus(API, "j")).toEqual({
      status: "failed",
      error: "claude: usage limit reached",
    });

    stubFetch(() => json({ status: "failed" }));
    expect(await fetchJobStatus(API, "j")).toEqual({ status: "failed", error: "No reason given." });
  });

  it("returns a finished job's samples with their order, features and gaps intact", async () => {
    stubFetch(() =>
      json({
        status: "done",
        samples: {
          "Amorphous PEO (undoped)": [
            { "Temperature (°C)": 20, "Conductivity (S/cm)": 1e-7 },
            { "Temperature (°C)": 25, "Conductivity (S/cm)": null },
          ],
          "PEO:LiClO4 - 64:1": [{ "Temperature (°C)": "RT", "Conductivity (S/cm)": 1.78e-7 }],
        },
      }),
    );

    const status = await fetchJobStatus(API, "j");

    expect(status).toEqual({
      status: "done",
      samples: {
        "Amorphous PEO (undoped)": [
          { "Temperature (°C)": 20, "Conductivity (S/cm)": 1e-7 },
          { "Temperature (°C)": 25, "Conductivity (S/cm)": null },
        ],
        "PEO:LiClO4 - 64:1": [{ "Temperature (°C)": "RT", "Conductivity (S/cm)": 1.78e-7 }],
      },
    });
    if (status.status !== "done") throw new Error("expected done");
    expect(Object.keys(status.samples)).toEqual(["Amorphous PEO (undoped)", "PEO:LiClO4 - 64:1"]);
  });

  it("shows a value of a type the schema doesn't allow as its JSON, not as nothing", async () => {
    stubFetch(() => json({ status: "done", samples: { s: [{ a: true, b: [1, 2] }] } }));
    expect(await fetchJobStatus(API, "j")).toEqual({
      status: "done",
      samples: { s: [{ a: "true", b: "[1,2]" }] },
    });
  });

  it("flags samples that aren't sample → list of points as unreadable", async () => {
    for (const samples of [[], { s: "nope" }, { s: [1, 2] }, null]) {
      stubFetch(() => json({ status: "done", samples }));
      expect((await rejection(fetchJobStatus(API, "j"))).kind).toBe("bad-response");
    }
  });

  it("flags an unknown status as unreadable", async () => {
    stubFetch(() => json({ status: "queued" }));
    expect((await rejection(fetchJobStatus(API, "j"))).kind).toBe("bad-response");
  });

  it("turns a 404 into `job-lost`, with the server's explanation", async () => {
    stubFetch(() =>
      json({ detail: "No such job. The server forgets its jobs when it restarts." }, 404),
    );
    const error = await rejection(fetchJobStatus(API, "j"));
    expect(error).toMatchObject({
      kind: "job-lost",
      status: 404,
      message: "No such job. The server forgets its jobs when it restarts.",
    });
  });

  it("reports other error statuses and lost connections", async () => {
    stubFetch(() => new Response("oops", { status: 500 }));
    expect((await rejection(fetchJobStatus(API, "j"))).kind).toBe("http");

    stubFetch(() => Promise.reject(new TypeError("Load failed")));
    expect((await rejection(fetchJobStatus(API, "j"))).kind).toBe("network");
  });
});

describe("parseJobStatus — the job's own details", () => {
  it("reads the file name, features and start time from any status", () => {
    expect(
      parseJobStatus({ status: "running", file: "a.pdf", features: ["Tg"], started: 1.5 }),
    ).toEqual({ status: "running", fileName: "a.pdf", features: ["Tg"], startedAt: 1500 });
    expect(
      parseJobStatus({ status: "failed", error: "x", file: "a.pdf", features: [], started: 2 }),
    ).toEqual({ status: "failed", error: "x", fileName: "a.pdf", features: [], startedAt: 2000 });
  });

  it("leaves out a detail of the wrong type rather than refusing the answer", () => {
    expect(
      parseJobStatus({ status: "done", samples: {}, file: 3, features: ["Tg", 2], started: "now" }),
    ).toEqual({ status: "done", samples: {} });
  });
});

describe("parseJobStatus — a running job's progress", () => {
  const parsing = {
    step: "parsing",
    name: "Parsing the PDF",
    description: "MinerU is turning the paper into text, tables and figure images.",
    percent: 5,
  };

  it("reads the step, what to call it, its description and the percent", () => {
    expect(parseJobStatus({ status: "running", progress: parsing })).toEqual({
      status: "running",
      progress: parsing,
    });
  });

  it("keeps the percent within 0–100", () => {
    expect(parseJobStatus({ status: "running", progress: { ...parsing, percent: 140 } })).toEqual({
      status: "running",
      progress: { ...parsing, percent: 100 },
    });
    expect(parseJobStatus({ status: "running", progress: { ...parsing, percent: -3 } })).toEqual({
      status: "running",
      progress: { ...parsing, percent: 0 },
    });
  });

  it("drops a malformed progress rather than refusing the answer", () => {
    for (const progress of [
      null,
      "parsing",
      { ...parsing, percent: "5" },
      { ...parsing, percent: Number.NaN },
      { ...parsing, name: "" },
      { ...parsing, step: 1 },
    ]) {
      expect(parseJobStatus({ status: "running", progress })).toEqual({ status: "running" });
    }
  });

  it("treats a missing description as empty", () => {
    const progress = { step: "asking", name: "Asking the model", percent: 60 };
    expect(parseJobStatus({ status: "running", progress })).toEqual({
      status: "running",
      progress: { ...progress, description: "" },
    });
  });

  it("only reads progress from a running answer", () => {
    expect(parseJobStatus({ status: "done", samples: {}, progress: parsing })).toEqual({
      status: "done",
      samples: {},
    });
  });
});
