import { useCallback, useEffect, useState } from "react";
import { ExtractApiError, isAbortError } from "../extract/api";
import { EXTRACT_API_URL } from "../extract/config";
import { retryActionFor, type ExtractStage } from "../extract/describe-error";
import {
  fetchDiscoveryStatus,
  startDiscovery,
  type DiscoverProgress,
  type DiscoverRequest,
  type DiscoveredPaper,
  type DiscoverStatus,
} from "./api";

/** How long to wait between status checks. */
export const POLL_INTERVAL_MS = 3000;

/** Status checks in a row that may fail before the page gives up, as on Extract. */
export const MAX_FAILED_POLLS = 3;

export type DiscoveryState =
  | { readonly phase: "idle" }
  | {
      readonly phase: "submitting";
      readonly request: DiscoverRequest;
      readonly startedAt: number;
    }
  | {
      readonly phase: "running";
      readonly request: DiscoverRequest;
      readonly startedAt: number;
      readonly job: string;
      readonly progress: DiscoverProgress | null;
      /** Status checks so far. Each new value schedules the next check. */
      readonly polls: number;
      readonly failedPolls: number;
    }
  | {
      readonly phase: "done";
      readonly request: DiscoverRequest;
      readonly job: string;
      readonly papers: readonly DiscoveredPaper[];
    }
  | {
      readonly phase: "failed";
      readonly request: DiscoverRequest;
      readonly startedAt: number;
      readonly error: ExtractApiError;
      readonly stage: ExtractStage;
      readonly job?: string;
    };

const IDLE: DiscoveryState = { phase: "idle" };

/** The search the page is showing, if any: what its address names. */
export function jobOf(state: DiscoveryState): string | null {
  return state.phase === "running" || state.phase === "done" || state.phase === "failed"
    ? (state.job ?? null)
    : null;
}

/** Fill in what the server says about the search: for one reopened from the
 *  address, this is the only place its keywords and features come from. */
function withServerInfo(request: DiscoverRequest, status: DiscoverStatus): DiscoverRequest {
  return {
    ...request,
    keywords: status.keywords ?? request.keywords,
    features: status.features ?? request.features,
  };
}

/** What "Try again" would do now, or `null` when it can't help. Starting
 *  over needs the keywords, which a search the server has lost may lack. */
export function retryActionOf(state: DiscoveryState) {
  if (state.phase !== "failed") return null;
  const action = retryActionFor(state.error, state.stage);
  if (action === "resume" && !state.job) return "resubmit";
  if (action === "resubmit" && !state.request.keywords) return null;
  return action;
}

function asApiError(error: unknown): ExtractApiError {
  return error instanceof ExtractApiError
    ? error
    : new ExtractApiError("bad-response", error instanceof Error ? error.message : String(error));
}

/**
 * Runs one search at a time, the way `useExtraction` runs an extraction:
 * start it, check on it every `POLL_INTERVAL_MS`, end in `done` or
 * `failed`. Leaving a phase cancels its timer and request.
 *
 * `job` reopens a search the page was showing before, from its address
 * (issue #18): the first check on it goes out at once, and its keywords,
 * features and start time come from the server. The server can't cancel a
 * search, so one left running still finishes there, and its address shows
 * the result.
 */
export function useDiscovery(apiUrl: string = EXTRACT_API_URL, job: string | null = null) {
  const [state, setState] = useState<DiscoveryState>(() =>
    job
      ? {
          phase: "running",
          request: { keywords: "", seeds: [], features: [] },
          startedAt: Date.now(),
          job,
          progress: null,
          polls: 0,
          failedPolls: 0,
        }
      : IDLE,
  );

  useEffect(() => {
    if (state.phase !== "submitting") return;
    const { request, startedAt } = state;
    const controller = new AbortController();
    startDiscovery(apiUrl, request, controller.signal).then(
      (job) => {
        if (controller.signal.aborted) return;
        setState({
          phase: "running",
          request,
          startedAt,
          job,
          progress: null,
          polls: 0,
          failedPolls: 0,
        });
      },
      (error: unknown) => {
        if (controller.signal.aborted || isAbortError(error)) return;
        setState({
          phase: "failed",
          request,
          startedAt,
          error: asApiError(error),
          stage: "submit",
        });
      },
    );
    return () => controller.abort();
  }, [state, apiUrl]);

  useEffect(() => {
    if (state.phase !== "running") return;
    const current = state;
    const controller = new AbortController();
    const fail = (error: ExtractApiError) =>
      setState({
        phase: "failed",
        request: current.request,
        startedAt: current.startedAt,
        job: current.job,
        stage: "poll",
        error,
      });

    // A search reopened from the address is checked at once, so the page
    // doesn't sit on an empty progress card before showing its results.
    const reopened = current.polls === 0 && current.request.keywords === "";
    const timer = window.setTimeout(
      () => {
        fetchDiscoveryStatus(apiUrl, current.job, controller.signal).then(
          (status) => {
            if (controller.signal.aborted) return;
            const request = withServerInfo(current.request, status);
            const startedAt = status.startedAt ?? current.startedAt;
            if (status.status === "running") {
              setState({
                ...current,
                request,
                startedAt,
                progress: status.progress ?? current.progress,
                polls: current.polls + 1,
                failedPolls: 0,
              });
            } else if (status.status === "done") {
              setState({ phase: "done", request, job: current.job, papers: status.papers });
            } else {
              setState({
                phase: "failed",
                request,
                startedAt,
                job: current.job,
                stage: "poll",
                error: new ExtractApiError("failed", status.error),
              });
            }
          },
          (error: unknown) => {
            if (controller.signal.aborted || isAbortError(error)) return;
            const apiError = asApiError(error);
            const failedPolls = current.failedPolls + 1;
            if (retryActionFor(apiError, "poll") === "resume" && failedPolls < MAX_FAILED_POLLS) {
              setState({ ...current, polls: current.polls + 1, failedPolls });
            } else {
              fail(apiError);
            }
          },
        );
      },
      reopened ? 0 : POLL_INTERVAL_MS,
    );

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [state, apiUrl]);

  const start = useCallback((request: DiscoverRequest) => {
    setState({ phase: "submitting", request, startedAt: Date.now() });
  }, []);

  /** "Try again": check on the same search, or start it over — whichever
   *  `retryActionOf` says. */
  const retry = useCallback(() => {
    setState((current): DiscoveryState => {
      if (current.phase !== "failed") return current;
      const action = retryActionOf(current);
      if (action === "resume" && current.job) {
        return {
          phase: "running",
          request: current.request,
          startedAt: current.startedAt,
          job: current.job,
          progress: null,
          polls: 0,
          failedPolls: 0,
        };
      }
      if (action === null) return current;
      return { phase: "submitting", request: current.request, startedAt: Date.now() };
    });
  }, []);

  const reset = useCallback(() => setState(IDLE), []);

  return { state, start, retry, reset };
}
