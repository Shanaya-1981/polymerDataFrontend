/**
 * The two calls the Discover page makes to the extraction server
 * (`extraction/api.py`): start a search for papers, then ask how it is
 * doing. Requests and errors go through the Extract page's client, so an
 * error here is the same `ExtractApiError`, with the same kinds.
 */
import {
  ExtractApiError,
  detailOf,
  failedStatus,
  isRecord,
  request,
  unreadable,
} from "../extract/api";

export interface DiscoverRequest {
  readonly keywords: string;
  /** Papers the user already has, each a DOI or a title. */
  readonly seeds: readonly string[];
  readonly features: readonly string[];
}

/** One paper the search judged likely to report the data. */
export interface DiscoveredPaper {
  readonly title: string;
  readonly authors: readonly string[];
  readonly year: number | null;
  readonly journal: string | null;
  /** `https://doi.org/...` */
  readonly doi: string | null;
  /** An open-access PDF, when OpenAlex knows one. */
  readonly pdf: string | null;
  /** The model's 0–3: 3 clearly reports the data, 2 probably. */
  readonly score: number;
  /** Why the model judged it so. */
  readonly reason: string;
  /** One sentence from the abstract; `null` when there is no abstract. */
  readonly description: string | null;
  /** The paper's OpenAlex page. */
  readonly openalex: string;
}

/** Counts so far, which the server updates as the search goes. */
export interface DiscoverProgress {
  readonly candidates: number;
  readonly judged: number;
  readonly likely: number;
  readonly seconds: number;
}

export type DiscoverStatus =
  | { readonly status: "running"; readonly progress: DiscoverProgress | null }
  | { readonly status: "failed"; readonly error: string }
  | { readonly status: "done"; readonly papers: readonly DiscoveredPaper[] };

/** Start a search; resolves to its id. */
export async function startDiscovery(
  apiUrl: string,
  search: DiscoverRequest,
  signal?: AbortSignal,
): Promise<string> {
  const response = await request(`${apiUrl}/discover`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(search),
    signal,
  });
  if (!response.ok) throw failedStatus(response);
  const { body } = response;
  if (isRecord(body) && typeof body.job === "string" && body.job !== "") return body.job;
  throw unreadable(response, "a job id");
}

/** Ask how search `job` is doing. */
export async function fetchDiscoveryStatus(
  apiUrl: string,
  job: string,
  signal?: AbortSignal,
): Promise<DiscoverStatus> {
  const response = await request(`${apiUrl}/discover/${encodeURIComponent(job)}`, { signal });
  if (response.status === 404) {
    throw new ExtractApiError("job-lost", detailOf(response.body) ?? "No such search.", 404);
  }
  if (!response.ok) throw failedStatus(response);
  const status = parseDiscoverStatus(response.body);
  if (!status) throw unreadable(response, "a search status");
  return status;
}

const text = (value: unknown): string | null =>
  typeof value === "string" && value !== "" ? value : null;

function parseProgress(value: unknown): DiscoverProgress | null {
  if (!isRecord(value)) return null;
  const { candidates, judged, likely, seconds } = value;
  if ([candidates, judged, likely, seconds].some((n) => typeof n !== "number")) return null;
  return {
    candidates: candidates as number,
    judged: judged as number,
    likely: likely as number,
    seconds: seconds as number,
  };
}

/** A paper from the server, or `null` if it isn't one. */
function parsePaper(value: unknown): DiscoveredPaper | null {
  if (!isRecord(value)) return null;
  const title = text(value.title);
  const openalex = text(value.openalex);
  if (!title || !openalex || typeof value.score !== "number") return null;
  return {
    title,
    authors: Array.isArray(value.authors)
      ? value.authors.filter((a): a is string => typeof a === "string")
      : [],
    year: typeof value.year === "number" ? value.year : null,
    journal: text(value.journal),
    doi: text(value.doi),
    pdf: text(value.pdf),
    score: value.score,
    reason: text(value.reason) ?? "",
    description: text(value.description),
    openalex,
  };
}

/** A search-status answer, or `null` if it isn't one. */
export function parseDiscoverStatus(body: unknown): DiscoverStatus | null {
  if (!isRecord(body)) return null;
  switch (body.status) {
    case "running":
      return { status: "running", progress: parseProgress(body.progress) };
    case "failed":
      return { status: "failed", error: text(body.error) ?? "No reason given." };
    case "done": {
      if (!Array.isArray(body.papers)) return null;
      const papers: DiscoveredPaper[] = [];
      for (const item of body.papers) {
        const paper = parsePaper(item);
        if (!paper) return null;
        papers.push(paper);
      }
      return { status: "done", papers };
    }
    default:
      return null;
  }
}
