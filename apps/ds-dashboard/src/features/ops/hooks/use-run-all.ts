/**
 * useRunAll hook - encapsulates run-all sequence + polling.
 */

import { useState, useCallback } from "react";
import { requestJson, ApiError } from "@/lib/api";
import { API_ERROR_CODES } from "@/lib/api-errors";
import { getSystemHeaders } from "../lib/operations-artifacts";

export interface RunAllStep {
  label: string;
  endpoint: string;
}

export const REFRESH_ALL_SEQUENCE: RunAllStep[] = [
  { label: "Registry", endpoint: "/api/refresh-registry" },
  { label: "Usage Index", endpoint: "/api/refresh-token-usage-index" },
  { label: "Token Health", endpoint: "/api/refresh-token-health" },
  { label: "Token Graph", endpoint: "/api/refresh-token-graph" },
];

export const RUN_ALL_POLL_INTERVAL_MS = 900;
export const RUN_ALL_TIMEOUT_MS = 20 * 60 * 1000;

export type RequestJsonFn = <T>(
  input: string,
  init?: RequestInit,
) => Promise<T>;

export interface WaitForQueuedJobOptions {
  requestJsonFn?: RequestJsonFn;
  pollIntervalMs?: number;
  timeoutMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export async function waitForQueuedJob(
  statusUrl: string,
  options: WaitForQueuedJobOptions = {},
): Promise<boolean> {
  const {
    requestJsonFn = requestJson,
    pollIntervalMs = RUN_ALL_POLL_INTERVAL_MS,
    timeoutMs = RUN_ALL_TIMEOUT_MS,
    now = Date.now,
    sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        globalThis.setTimeout(resolve, ms);
      }),
  } = options;

  let cursor = 0;
  const deadline = now() + timeoutMs;

  while (now() < deadline) {
    const separator = statusUrl.includes("?") ? "&" : "?";
    let payload: Record<string, unknown>;
    try {
      payload = await requestJsonFn<Record<string, unknown>>(
        `${statusUrl}${separator}since=${cursor}`,
      );
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.recoverable &&
        (error.status >= 500 || error.status === 429)
      ) {
        await sleep(pollIntervalMs);
        continue;
      }
      return false;
    }

    const nextCursor = Number(payload.nextCursor);
    if (Number.isFinite(nextCursor) && nextCursor > cursor) cursor = nextCursor;

    const job = payload.job && typeof payload.job === "object"
      ? (payload.job as Record<string, unknown>)
      : null;
    const status = String(job?.status ?? "").trim().toLowerCase();
    if (status === "success") return true;
    if (status === "error" || status === "cancelled") return false;

    await sleep(pollIntervalMs);
  }

  return false;
}

export interface RunAllState {
  isRunning: boolean;
  stepIndex: number;
  failed: boolean;
  errorCode?: string;
  errorMessage?: string;
}

export type SetRunAllState = (
  next:
    | RunAllState
    | ((previous: RunAllState) => RunAllState),
) => void;

export interface ExecuteRunAllSequenceOptions {
  requestJsonFn: RequestJsonFn;
  setState: SetRunAllState;
  onDone: () => void;
  getHeaders?: () => HeadersInit | undefined;
  waitForQueuedJobFn?: (statusUrl: string) => Promise<boolean>;
}

export async function executeRunAllSequence({
  requestJsonFn,
  setState,
  onDone,
  getHeaders = getSystemHeaders,
  waitForQueuedJobFn = (statusUrl) => waitForQueuedJob(statusUrl),
}: ExecuteRunAllSequenceOptions): Promise<void> {
  setState({
    isRunning: true,
    stepIndex: 1,
    failed: false,
    errorCode: undefined,
    errorMessage: undefined,
  });

  for (let i = 0; i < REFRESH_ALL_SEQUENCE.length; i++) {
    setState((s) => ({ ...s, stepIndex: i + 1 }));
    try {
      const payload = await requestJsonFn<Record<string, unknown>>(
        REFRESH_ALL_SEQUENCE[i].endpoint,
        {
          method: "POST",
          headers: getHeaders(),
        },
      );
      const jobId = String(payload.jobId ?? "").trim();
      if (jobId) {
        const statusUrl =
          String(payload.statusUrl ?? "").trim() ||
          `/api/jobs/${encodeURIComponent(jobId)}`;
        const completed = await waitForQueuedJobFn(statusUrl);
        if (!completed) {
          setState({
            isRunning: false,
            stepIndex: i + 1,
            failed: true,
            errorCode: API_ERROR_CODES.QUEUE_JOB_FAILED_OR_CANCELLED,
            errorMessage: "Queued operation finished with error or cancellation.",
          });
          return;
        }
      }
    } catch (error) {
      const errorCode = error instanceof ApiError ? error.code : "request.failed";
      const errorMessage =
        error instanceof ApiError ? error.message : "Operation failed.";
      setState({
        isRunning: false,
        stepIndex: i + 1,
        failed: true,
        errorCode,
        errorMessage,
      });
      return;
    }
  }

  setState({
    isRunning: false,
    stepIndex: 0,
    failed: false,
    errorCode: undefined,
    errorMessage: undefined,
  });
  onDone();
}

export function useRunAll(onDone: () => void): [RunAllState, () => void] {
  const [state, setState] = useState<RunAllState>({
    isRunning: false,
    stepIndex: 0,
    failed: false,
  });

  const runAll = useCallback(async () => {
    await executeRunAllSequence({
      requestJsonFn: requestJson,
      setState,
      onDone,
    });
  }, [onDone]);

  return [state, runAll];
}
