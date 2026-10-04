/**
 * The two calls the Extract page makes to the extraction API
 * (`extraction/api.py` in the monorepo): start a job with a PDF and feature
 * names, then ask how it is doing. Everything that can go wrong on the way
 * — no answer, an answer that isn't JSON, a 400, a forgotten job — becomes
 * one `ExtractApiError` with a `kind`, which `describe-error.ts` turns into
 * words for the page.
 *
 * The server's answers are checked rather than trusted: this is the one
 * place data enters the app from outside the build. The Discover page talks
 * to the same server, so its client (`discover/api.ts`) reuses the request
 * and error handling here.
 */

/** One value of one feature; `null` where the paper doesn't give it. */
export type ExtractedValue = string | number | null;

/** One data point: every feature, keyed by its name as the server trimmed it. */
export type DataPoint = Readonly<Record<string, ExtractedValue>>;

/** Each sample's name — as the paper gives it — mapped to its data points. */
export type Samples = Readonly<Record<string, readonly DataPoint[]>>;

/** What the server says about the job itself, in every status answer. A
 *  page opened at a job's address has no other way to know them. */
export interface JobInfo {
  /** The PDF's file name, as uploaded. */
  readonly fileName?: string;
  /** The feature names, as the server split them. */
  readonly features?: readonly string[];
  /** When the job started, in milliseconds like `Date.now()`. */
  readonly startedAt?: number;
}

export type JobStatus = (
  | { readonly status: "running" }
  | { readonly status: "failed"; readonly error: string }
  | { readonly status: "done"; readonly samples: Samples }
) &
  JobInfo;

export type ExtractApiErrorKind =
  /** No answer at all: the server is down, the URL is wrong, or the browser
   *  hid the answer because this page isn't on a localhost address (CORS). */
  | "network"
  /** An answer, but not JSON, or not the shape the API documents. */
  | "bad-response"
  /** 400: the server refused the input (not a PDF, or no feature names). */
  | "rejected"
  /** 404 for a job: it was still running when the server stopped, or the
   *  page's address names a job the server never had. */
  | "job-lost"
  /** Any other status that isn't a success. */
  | "http"
  /** The job ran and ended with `{"status": "failed"}`. */
  | "failed";

export class ExtractApiError extends Error {
  constructor(
    readonly kind: ExtractApiErrorKind,
    /** The server's own reason where it gave one, else what went wrong. */
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ExtractApiError";
  }
}

/** `fetch` rejects with this when its `AbortSignal` fires — a cancellation
 *  the caller asked for, never an error to show. Checked by name: it is a
 *  `DOMException`, which isn't an `Error` in every environment (jsdom). */
export function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const NOT_JSON = Symbol("not JSON");

export interface ApiResponse {
  readonly status: number;
  readonly ok: boolean;
  readonly body: unknown;
}

export async function request(url: string, init: RequestInit): Promise<ApiResponse> {
  let response: Response;
  let text: string;
  try {
    response = await fetch(url, init);
    text = await response.text();
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ExtractApiError("network", error instanceof Error ? error.message : String(error));
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = NOT_JSON;
  }
  return { status: response.status, ok: response.ok, body };
}

/** FastAPI puts the reason for an error in `detail`. */
export function detailOf(body: unknown): string | undefined {
  return isRecord(body) && typeof body.detail === "string" ? body.detail : undefined;
}

export function unreadable(response: ApiResponse, expected: string): ExtractApiError {
  const what = response.body === NOT_JSON ? "an answer that isn't JSON" : "an unexpected answer";
  return new ExtractApiError(
    "bad-response",
    `Got ${what} (HTTP ${response.status}) where ${expected} was expected.`,
    response.status,
  );
}

export function failedStatus(response: ApiResponse): ExtractApiError {
  const detail = detailOf(response.body);
  if (response.status === 400) {
    return new ExtractApiError("rejected", detail ?? "The server refused the request.", 400);
  }
  return new ExtractApiError("http", detail ?? `HTTP ${response.status}`, response.status);
}

/**
 * Start an extraction job; resolves to its id. `features` go as one
 * comma-separated string, the form `POST /extract` takes.
 */
export async function startExtraction(
  apiUrl: string,
  pdf: File,
  features: readonly string[],
  signal?: AbortSignal,
): Promise<string> {
  const form = new FormData();
  form.append("pdf", pdf);
  form.append("features", features.join(", "));

  const response = await request(`${apiUrl}/extract`, { method: "POST", body: form, signal });
  if (!response.ok) throw failedStatus(response);
  const { body } = response;
  if (isRecord(body) && typeof body.job === "string" && body.job !== "") return body.job;
  throw unreadable(response, "a job id");
}

/** Ask how job `job` is doing. */
export async function fetchJobStatus(
  apiUrl: string,
  job: string,
  signal?: AbortSignal,
): Promise<JobStatus> {
  const response = await request(`${apiUrl}/extract/${encodeURIComponent(job)}`, { signal });
  if (response.status === 404) {
    throw new ExtractApiError("job-lost", detailOf(response.body) ?? "No such job.", 404);
  }
  if (!response.ok) throw failedStatus(response);
  const status = parseJobStatus(response.body);
  if (!status) throw unreadable(response, "a job status");
  return status;
}

/** `value` as a data point's value. The server's schema allows only these
 *  three types; anything else is shown as its JSON rather than dropped. */
function toValue(value: unknown): ExtractedValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number") return value;
  return JSON.stringify(value);
}

function parseSamples(value: unknown): Samples | null {
  if (!isRecord(value)) return null;
  const samples: Record<string, DataPoint[]> = {};
  for (const [name, points] of Object.entries(value)) {
    if (!Array.isArray(points)) return null;
    const parsed: DataPoint[] = [];
    for (const point of points) {
      if (!isRecord(point)) return null;
      parsed.push(
        Object.fromEntries(Object.entries(point).map(([feature, v]) => [feature, toValue(v)])),
      );
    }
    samples[name] = parsed;
  }
  return samples;
}

/** The job's own details from a status answer: each is left out when the
 *  server didn't send it, or sent something other than the documented type. */
function parseJobInfo(body: Record<string, unknown>): JobInfo {
  const info: { fileName?: string; features?: string[]; startedAt?: number } = {};
  if (typeof body.file === "string" && body.file !== "") info.fileName = body.file;
  if (Array.isArray(body.features) && body.features.every((name) => typeof name === "string")) {
    info.features = body.features;
  }
  if (typeof body.started === "number" && Number.isFinite(body.started)) {
    info.startedAt = body.started * 1000; // the server sends Unix seconds
  }
  return info;
}

/** A job-status answer, or `null` if it isn't one. */
export function parseJobStatus(body: unknown): JobStatus | null {
  if (!isRecord(body)) return null;
  const info = parseJobInfo(body);
  switch (body.status) {
    case "running":
      return { status: "running", ...info };
    case "failed":
      return {
        status: "failed",
        error:
          typeof body.error === "string" && body.error !== "" ? body.error : "No reason given.",
        ...info,
      };
    case "done": {
      const samples = parseSamples(body.samples);
      return samples ? { status: "done", samples, ...info } : null;
    }
    default:
      return null;
  }
}
