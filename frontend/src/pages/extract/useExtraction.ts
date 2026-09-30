import { useCallback, useEffect, useState } from "react";
import {
  ExtractApiError,
  fetchJobStatus,
  isAbortError,
  startExtraction,
  type Samples,
} from "./api";
import { EXTRACT_API_URL } from "./config";
import { retryActionFor, type ExtractStage } from "./describe-error";

/** How long to wait between status checks. */
export const POLL_INTERVAL_MS = 3000;

/**
 * Status checks in a row that may fail — no answer, an unreadable one, or a
 * server error — before the page stops and says so. A dev server restarting
 * or a laptop waking up shouldn't end a five-minute extraction. A job the
 * server has forgotten (404) or reports as failed ends it at once.
 */
export const MAX_FAILED_POLLS = 3;

export interface ExtractionRequest {
  readonly file: File;
  readonly features: readonly string[];
}

export type ExtractionState =
  | { readonly phase: "idle" }
  | {
      readonly phase: "submitting";
      readonly request: ExtractionRequest;
      readonly startedAt: number;
    }
  | {
      readonly phase: "running";
      readonly request: ExtractionRequest;
      readonly startedAt: number;
      readonly job: string;
      /** Status checks so far. Each new value schedules the next check. */
      readonly polls: number;
      /** Failed checks in a row; any answer that reads resets it. */
      readonly failedPolls: number;
    }
  | { readonly phase: "done"; readonly request: ExtractionRequest; readonly samples: Samples }
  | {
      readonly phase: "failed";
      readonly request: ExtractionRequest;
      readonly startedAt: number;
      readonly error: ExtractApiError;
      readonly stage: ExtractStage;
      /** The job, when one was started — what a "resume" retry checks on. */
      readonly job?: string;
    };

const IDLE: ExtractionState = { phase: "idle" };

function asApiError(error: unknown): ExtractApiError {
  return error instanceof ExtractApiError
    ? error
    : new ExtractApiError("bad-response", error instanceof Error ? error.message : String(error));
}

/**
 * Runs one extraction at a time: start a job, check on it every
 * `POLL_INTERVAL_MS`, and end in `done` or `failed`.
 *
 * The async work lives in effects keyed on the state, so leaving a phase —
 * `reset()` for "New extraction", or the page unmounting — cancels that
 * phase's timer and in-flight request through the effect's cleanup, and an
 * answer that arrives late can't overwrite what came after it. Checks never
 * overlap: the next wait starts only once the last answer is in.
 *
 * Nothing is kept anywhere but this state, so leaving the page forgets the
 * extraction — the server has no way to cancel a job either, so one left
 * running still finishes there.
 */
export function useExtraction(apiUrl: string = EXTRACT_API_URL) {
  const [state, setState] = useState<ExtractionState>(IDLE);

  useEffect(() => {
    if (state.phase !== "submitting") return;
    const { request, startedAt } = state;
    const controller = new AbortController();
    startExtraction(apiUrl, request.file, request.features, controller.signal).then(
      (job) => {
        if (controller.signal.aborted) return;
        setState({ phase: "running", request, startedAt, job, polls: 0, failedPolls: 0 });
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
      fetchJobStatus(apiUrl, current.job, controller.signal).then(
        (status) => {
          if (controller.signal.aborted) return;
          if (status.status === "running") {
            setState({ ...current, polls: current.polls + 1, failedPolls: 0 });
          } else if (status.status === "done") {
            setState({ phase: "done", request: current.request, samples: status.samples });
          } else {
            fail(new ExtractApiError("failed", status.error));
          }
        },
        (error: unknown) => {
          if (controller.signal.aborted || isAbortError(error)) return;
          const apiError = asApiError(error);
          const failedPolls = current.failedPolls + 1;
          // Only the errors a later check could get past are retried quietly.
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

  const start = useCallback((request: ExtractionRequest) => {
    setState({ phase: "submitting", request, startedAt: Date.now() });
  }, []);

  /** "Try again": check on the same job, or start it over — whichever
   *  `retryActionFor` says the error calls for. */
  const retry = useCallback(() => {
    setState((current): ExtractionState => {
      if (current.phase !== "failed") return current;
      const action = retryActionFor(current.error, current.stage);
      if (action === "resume" && current.job) {
        return {
          phase: "running",
          request: current.request,
          startedAt: current.startedAt,
          job: current.job,
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
