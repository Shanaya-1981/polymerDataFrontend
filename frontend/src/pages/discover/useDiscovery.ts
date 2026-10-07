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

function asApiError(error: unknown): ExtractApiError {
  return error instanceof ExtractApiError
    ? error
    : new ExtractApiError("bad-response", error instanceof Error ? error.message : String(error));
}

/**
 * Runs one search at a time, the way `useExtraction` runs an extraction:
 * start it, check on it every `POLL_INTERVAL_MS`, end in `done` or
 * `failed`. Leaving a phase cancels its timer and request.
 */
export function useDiscovery(apiUrl: string = EXTRACT_API_URL) {
  const [state, setState] = useState<DiscoveryState>(IDLE);

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

    const timer = window.setTimeout(() => {
      fetchDiscoveryStatus(apiUrl, current.job, controller.signal).then(
        (status) => {
          if (controller.signal.aborted) return;
          if (status.status === "running") {
            setState({
              ...current,
              progress: status.progress ?? current.progress,
              polls: current.polls + 1,
              failedPolls: 0,
            });
          } else if (status.status === "done") {
            setState({ phase: "done", request: current.request, papers: status.papers });
          } else {
            fail(new ExtractApiError("failed", status.error));
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
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [state, apiUrl]);

  const start = useCallback((request: DiscoverRequest) => {
    setState({ phase: "submitting", request, startedAt: Date.now() });
  }, []);

  /** "Try again": check on the same search, or start it over. */
  const retry = useCallback(() => {
    setState((current): DiscoveryState => {
      if (current.phase !== "failed") return current;
      const action = retryActionFor(current.error, current.stage);
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
