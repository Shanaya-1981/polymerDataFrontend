import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_FAILED_POLLS, POLL_INTERVAL_MS, retryActionOf, useExtraction } from "./useExtraction";

const API = "http://api.test";
const pdf = new File(["%PDF-1.4"], "paper.pdf", { type: "application/pdf" });
const request = { file: pdf, features: ["Temperature (°C)", "Conductivity (S/cm)"] };
const SAMPLES = { PEO: [{ "Temperature (°C)": 20, "Conductivity (S/cm)": 1e-7 }] };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const running = () => json({ status: "running" });
const offline = () => new TypeError("Failed to fetch");

type Reply = Response | Error | Promise<Response>;

/**
 * A scripted extraction server: each POST takes the next of `submits`, each
 * status check the next of `polls`. Like real `fetch`, a call rejects with
 * an AbortError as soon as its signal fires.
 */
function fakeServer(submits: Reply[], polls: Reply[] = []) {
  const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    const reply = init?.method === "POST" ? submits.shift() : polls.shift();
    return new Promise<Response>((resolve, reject) => {
      init?.signal?.addEventListener("abort", () =>
        reject(new DOMException("The operation was aborted.", "AbortError")),
      );
      if (reply === undefined) reject(new Error("no reply scripted"));
      else if (reply instanceof Error) reject(reply);
      else Promise.resolve(reply).then(resolve, reject);
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return {
    fetchMock,
    calls: () =>
      fetchMock.mock.calls.map(([input, init]) => `${init?.method ?? "GET"} ${String(input)}`),
  };
}

/** Let `ms` of fake time pass, running every timer and promise it releases. */
async function wait(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useExtraction", () => {
  it("starts a job, checks on it every 3 seconds, and ends with the samples", async () => {
    const server = fakeServer(
      [json({ job: "abc" }, 202)],
      [running(), running(), json({ status: "done", samples: SAMPLES })],
    );
    const { result } = renderHook(() => useExtraction(API));

    act(() => result.current.start(request));
    expect(result.current.state.phase).toBe("submitting");
    await wait(0);
    expect(result.current.state).toMatchObject({ phase: "running", job: "abc" });
    expect(server.calls()).toEqual([`POST ${API}/extract`]);

    await wait(POLL_INTERVAL_MS - 1);
    expect(server.calls()).toHaveLength(1);
    await wait(1);
    expect(server.calls()).toEqual([`POST ${API}/extract`, `GET ${API}/extract/abc`]);
    await wait(POLL_INTERVAL_MS);
    expect(server.calls()).toHaveLength(3);
    await wait(POLL_INTERVAL_MS);
    expect(result.current.state).toEqual({
      phase: "done",
      request: { ...request, fileName: "paper.pdf" },
      job: "abc",
      samples: SAMPLES,
    });

    await wait(POLL_INTERVAL_MS * 5);
    expect(server.calls()).toHaveLength(4);
  });

  it("never overlaps checks: the next 3-second wait starts once an answer is in", async () => {
    let answer: (response: Response) => void = () => {};
    const slow = new Promise<Response>((resolve) => {
      answer = resolve;
    });
    const server = fakeServer([json({ job: "abc" }, 202)], [slow, running()]);
    const { result } = renderHook(() => useExtraction(API));
    act(() => result.current.start(request));
    await wait(0);

    await wait(POLL_INTERVAL_MS);
    expect(server.calls()).toHaveLength(2);
    await wait(POLL_INTERVAL_MS * 4);
    expect(server.calls()).toHaveLength(2);

    await act(async () => {
      answer(running());
      await vi.advanceTimersByTimeAsync(0);
    });
    await wait(POLL_INTERVAL_MS - 1);
    expect(server.calls()).toHaveLength(2);
    await wait(1);
    expect(server.calls()).toHaveLength(3);
  });

  it("stops checking on reset, cancelling a check that's in flight", async () => {
    const server = fakeServer([json({ job: "abc" }, 202)], [new Promise<Response>(() => {})]);
    const { result } = renderHook(() => useExtraction(API));
    act(() => result.current.start(request));
    await wait(0);
    await wait(POLL_INTERVAL_MS);
    const signal = server.fetchMock.mock.calls[1][1]?.signal;
    expect(signal?.aborted).toBe(false);

    act(() => result.current.reset());

    expect(result.current.state).toEqual({ phase: "idle" });
    expect(signal?.aborted).toBe(true);
    await wait(POLL_INTERVAL_MS * 5);
    expect(server.calls()).toHaveLength(2);
    expect(result.current.state).toEqual({ phase: "idle" });
  });

  it("stops before the next check when reset while waiting", async () => {
    const server = fakeServer([json({ job: "abc" }, 202)], [running()]);
    const { result } = renderHook(() => useExtraction(API));
    act(() => result.current.start(request));
    await wait(0);
    await wait(POLL_INTERVAL_MS - 1);

    act(() => result.current.reset());
    await wait(POLL_INTERVAL_MS * 5);

    expect(server.calls()).toEqual([`POST ${API}/extract`]);
  });

  it("cancels the upload itself when reset before the job id comes back", async () => {
    const server = fakeServer([new Promise<Response>(() => {})]);
    const { result } = renderHook(() => useExtraction(API));
    act(() => result.current.start(request));
    await wait(0);
    const signal = server.fetchMock.mock.calls[0][1]?.signal;

    act(() => result.current.reset());

    expect(signal?.aborted).toBe(true);
    expect(result.current.state).toEqual({ phase: "idle" });
  });

  it("stops everything when the page unmounts", async () => {
    const server = fakeServer([json({ job: "abc" }, 202)], [running(), running()]);
    const { result, unmount } = renderHook(() => useExtraction(API));
    act(() => result.current.start(request));
    await wait(0);

    unmount();
    await wait(POLL_INTERVAL_MS * 5);

    expect(server.calls()).toEqual([`POST ${API}/extract`]);
  });

  it("ends a failed job with the server's reason, and Try again starts a new job", async () => {
    const server = fakeServer(
      [json({ job: "abc" }, 202), json({ job: "def" }, 202)],
      [json({ status: "failed", error: "claude: usage limit reached" })],
    );
    const { result } = renderHook(() => useExtraction(API));
    act(() => result.current.start(request));
    await wait(0);
    await wait(POLL_INTERVAL_MS);

    expect(result.current.state).toMatchObject({
      phase: "failed",
      stage: "poll",
      job: "abc",
      error: { kind: "failed", message: "claude: usage limit reached" },
    });

    act(() => result.current.retry());
    expect(result.current.state.phase).toBe("submitting");
    await wait(0);
    expect(result.current.state).toMatchObject({ phase: "running", job: "def" });
    expect(server.calls().filter((call) => call.startsWith("POST"))).toHaveLength(2);
  });

  it("fails at once when the server has forgotten the job, and Try again starts over", async () => {
    const server = fakeServer(
      [json({ job: "abc" }, 202), json({ job: "def" }, 202)],
      [json({ detail: "No such job. The server forgets its jobs when it restarts." }, 404)],
    );
    const { result } = renderHook(() => useExtraction(API));
    act(() => result.current.start(request));
    await wait(0);
    await wait(POLL_INTERVAL_MS);

    expect(result.current.state).toMatchObject({ phase: "failed", error: { kind: "job-lost" } });
    expect(server.calls()).toHaveLength(2);

    act(() => result.current.retry());
    await wait(0);
    expect(result.current.state).toMatchObject({ phase: "running", job: "def" });
  });

  it("rides out a few failed checks, then says so; Try again checks on the same job", async () => {
    const quietFailures = Array.from({ length: MAX_FAILED_POLLS - 1 }, offline);
    const failures = Array.from({ length: MAX_FAILED_POLLS }, offline);
    const server = fakeServer(
      [json({ job: "abc" }, 202)],
      [...quietFailures, running(), ...failures, running()],
    );
    const { result } = renderHook(() => useExtraction(API));
    act(() => result.current.start(request));
    await wait(0);
    const { startedAt } = result.current.state as { startedAt: number };

    for (let i = 1; i < MAX_FAILED_POLLS; i++) {
      await wait(POLL_INTERVAL_MS);
      expect(result.current.state).toMatchObject({ phase: "running", failedPolls: i });
    }
    await wait(POLL_INTERVAL_MS);
    expect(result.current.state).toMatchObject({ phase: "running", failedPolls: 0 });

    for (let i = 1; i <= MAX_FAILED_POLLS; i++) await wait(POLL_INTERVAL_MS);
    expect(result.current.state).toMatchObject({
      phase: "failed",
      stage: "poll",
      job: "abc",
      error: { kind: "network" },
    });

    act(() => result.current.retry());
    expect(result.current.state).toMatchObject({
      phase: "running",
      job: "abc",
      startedAt,
      failedPolls: 0,
    });
    await wait(POLL_INTERVAL_MS);
    expect(server.calls().at(-1)).toBe(`GET ${API}/extract/abc`);
    expect(server.calls().filter((call) => call.startsWith("POST"))).toHaveLength(1);
  });

  it("fails at once when the upload is refused, and offers nothing to retry", async () => {
    const server = fakeServer([json({ detail: "The uploaded file isn't a PDF." }, 400)]);
    const { result } = renderHook(() => useExtraction(API));
    act(() => result.current.start(request));
    await wait(0);

    const failed = result.current.state;
    expect(failed).toMatchObject({
      phase: "failed",
      stage: "submit",
      error: { kind: "rejected", message: "The uploaded file isn't a PDF." },
    });

    act(() => result.current.retry());
    expect(result.current.state).toBe(failed);
    await wait(POLL_INTERVAL_MS);
    expect(server.calls()).toHaveLength(1);
  });

  it("fails when the upload gets no answer, and Try again sends it again", async () => {
    const server = fakeServer([offline(), json({ job: "abc" }, 202)]);
    const { result } = renderHook(() => useExtraction(API));
    act(() => result.current.start(request));
    await wait(0);
    expect(result.current.state).toMatchObject({
      phase: "failed",
      stage: "submit",
      error: { kind: "network" },
    });

    act(() => result.current.retry());
    await wait(0);
    expect(result.current.state).toMatchObject({ phase: "running", job: "abc" });
    expect(server.calls()).toEqual([`POST ${API}/extract`, `POST ${API}/extract`]);
  });
});

describe("useExtraction — a job reopened from the page's address", () => {
  const details = { file: "paper.pdf", features: ["Tg"], started: 1000 };

  it("checks at once, and takes the file name, features and start time from the server", async () => {
    const server = fakeServer(
      [],
      [
        json({ status: "running", ...details }),
        json({ status: "done", samples: SAMPLES, ...details }),
      ],
    );
    const { result } = renderHook(() => useExtraction(API, "abc"));
    expect(result.current.state).toMatchObject({ phase: "running", job: "abc" });

    await wait(0);
    expect(server.calls()).toEqual([`GET ${API}/extract/abc`]);
    expect(result.current.state).toMatchObject({
      phase: "running",
      request: { fileName: "paper.pdf", features: ["Tg"] },
      startedAt: 1_000_000,
    });

    await wait(POLL_INTERVAL_MS);
    expect(result.current.state).toEqual({
      phase: "done",
      request: { fileName: "paper.pdf", features: ["Tg"] },
      job: "abc",
      samples: SAMPLES,
    });
  });

  it("can't be started over, because the page doesn't have its PDF", async () => {
    const server = fakeServer([], [json({ detail: "No such job." }, 404)]);
    const { result } = renderHook(() => useExtraction(API, "gone"));
    await wait(0);
    expect(result.current.state).toMatchObject({ phase: "failed", job: "gone" });
    expect(retryActionOf(result.current.state)).toBeNull();

    act(() => result.current.retry());
    await wait(POLL_INTERVAL_MS);
    expect(result.current.state.phase).toBe("failed");
    expect(server.calls()).toHaveLength(1);
  });

  it("can still be checked on again after losing contact", async () => {
    fakeServer([], [offline(), offline(), offline(), json({ status: "done", samples: SAMPLES })]);
    const { result } = renderHook(() => useExtraction(API, "abc"));
    await wait(0); // the first check, at once
    for (let check = 1; check < MAX_FAILED_POLLS; check++) await wait(POLL_INTERVAL_MS);
    expect(result.current.state).toMatchObject({ phase: "failed", stage: "poll" });
    expect(retryActionOf(result.current.state)).toBe("resume");

    act(() => result.current.retry());
    await wait(0);
    expect(result.current.state).toMatchObject({ phase: "done", job: "abc" });
  });
});
