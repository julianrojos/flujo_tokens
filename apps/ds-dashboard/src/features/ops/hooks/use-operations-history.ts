/**
 * useOperationsHistory hook - encapsulates history + regressions + replay.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import {
  fetchOperationsHistory,
  fetchOperationsRegressions,
  replayOperationEvent,
  type OperationHistoryEvent,
  type OperationRegression,
} from "@/lib/api";
import { toApiErrorDisplay, type ApiErrorDisplay } from "@/lib/api-error-ux";

export interface UseOperationsHistoryResult {
  historyEvents: OperationHistoryEvent[];
  historyLoading: boolean;
  historyError: ApiErrorDisplay | null;
  regressions: OperationRegression[];
  regressionsLoading: boolean;
  regressionsError: ApiErrorDisplay | null;
  selectedHistoryEventId: string | null;
  replayInFlightEventId: string | null;
  replayNotice: string | null;
  replayError: ApiErrorDisplay | null;
  selectedHistoryEvent: OperationHistoryEvent | null;
  refreshOperationHistory: () => Promise<void>;
  refreshOperationRegressions: () => Promise<void>;
  setSelectedHistoryEventId: (id: string | null) => void;
  replaySelectedOperation: () => Promise<void>;
  clearReplayState: () => void;
}

export interface RefreshOperationHistoryOptions {
  inFlightRef: { current: boolean };
  fetchHistory?: typeof fetchOperationsHistory;
  setHistoryLoading: (next: boolean) => void;
  setHistoryError: (next: ApiErrorDisplay | null) => void;
  setHistoryEvents: (next: OperationHistoryEvent[]) => void;
  setSelectedHistoryEventId: (
    updater: (current: string | null) => string | null,
  ) => void;
  toApiErrorDisplayFn?: typeof toApiErrorDisplay;
  limit?: number;
}

export async function refreshOperationHistoryWithDeps({
  inFlightRef,
  fetchHistory = fetchOperationsHistory,
  setHistoryLoading,
  setHistoryError,
  setHistoryEvents,
  setSelectedHistoryEventId,
  toApiErrorDisplayFn = toApiErrorDisplay,
  limit = 12,
}: RefreshOperationHistoryOptions): Promise<void> {
  if (inFlightRef.current) return;
  inFlightRef.current = true;

  setHistoryLoading(true);
  setHistoryError(null);

  try {
    const payload = await fetchHistory({ limit });
    const nextEvents = payload.events || [];
    setHistoryEvents(nextEvents);
    setSelectedHistoryEventId((current) =>
      nextEvents.some((event) => event.id === current)
        ? current
        : (nextEvents[0]?.id ?? null),
    );
  } catch (cause) {
    setHistoryError(
      toApiErrorDisplayFn(cause, {
        fallbackTitle: "Operations history unavailable",
        fallbackMessage: "Unable to load recent operations history.",
      }),
    );
    setHistoryEvents([]);
    setSelectedHistoryEventId(() => null);
  } finally {
    inFlightRef.current = false;
    setHistoryLoading(false);
  }
}

export interface RefreshOperationRegressionsOptions {
  inFlightRef: { current: boolean };
  fetchRegressions?: typeof fetchOperationsRegressions;
  setRegressionsLoading: (next: boolean) => void;
  setRegressionsError: (next: ApiErrorDisplay | null) => void;
  setRegressions: (next: OperationRegression[]) => void;
  toApiErrorDisplayFn?: typeof toApiErrorDisplay;
  limit?: number;
  minSamples?: number;
}

export async function refreshOperationRegressionsWithDeps({
  inFlightRef,
  fetchRegressions = fetchOperationsRegressions,
  setRegressionsLoading,
  setRegressionsError,
  setRegressions,
  toApiErrorDisplayFn = toApiErrorDisplay,
  limit = 300,
  minSamples = 4,
}: RefreshOperationRegressionsOptions): Promise<void> {
  if (inFlightRef.current) return;
  inFlightRef.current = true;

  setRegressionsLoading(true);
  setRegressionsError(null);

  try {
    const payload = await fetchRegressions({ limit, minSamples });
    setRegressions(payload.regressions || []);
  } catch (cause) {
    setRegressionsError(
      toApiErrorDisplayFn(cause, {
        fallbackTitle: "Regression signals unavailable",
        fallbackMessage: "Unable to compute operation regressions.",
      }),
    );
    setRegressions([]);
  } finally {
    inFlightRef.current = false;
    setRegressionsLoading(false);
  }
}

export interface ReplaySelectedOperationOptions {
  selectedHistoryEvent: OperationHistoryEvent | null;
  replayInFlightEventId: string | null;
  replayOperationEventFn?: typeof replayOperationEvent;
  setReplayInFlightEventId: (next: string | null) => void;
  setReplayNotice: (next: string | null) => void;
  setReplayError: (next: ApiErrorDisplay | null) => void;
  refreshOperationHistory: () => Promise<void>;
  refreshOperationRegressions: () => Promise<void>;
  toApiErrorDisplayFn?: typeof toApiErrorDisplay;
}

export async function replaySelectedOperationWithDeps({
  selectedHistoryEvent,
  replayInFlightEventId,
  replayOperationEventFn = replayOperationEvent,
  setReplayInFlightEventId,
  setReplayNotice,
  setReplayError,
  refreshOperationHistory,
  refreshOperationRegressions,
  toApiErrorDisplayFn = toApiErrorDisplay,
}: ReplaySelectedOperationOptions): Promise<void> {
  if (!selectedHistoryEvent || replayInFlightEventId) return;

  setReplayInFlightEventId(selectedHistoryEvent.id);
  setReplayNotice(null);
  setReplayError(null);

  try {
    const payload = await replayOperationEventFn(selectedHistoryEvent.id, {
      systemId: selectedHistoryEvent.system || undefined,
    });
    setReplayNotice(`Replay queued as ${payload.jobId}.`);
    void refreshOperationHistory().catch(() => undefined);
    void refreshOperationRegressions().catch(() => undefined);
  } catch (cause) {
    setReplayError(
      toApiErrorDisplayFn(cause, {
        fallbackTitle: "Replay failed",
        fallbackMessage: "Unable to enqueue replay for this operation.",
      }),
    );
  } finally {
    setReplayInFlightEventId(null);
  }
}

export function useOperationsHistory(): UseOperationsHistoryResult {
  const [historyEvents, setHistoryEvents] = useState<OperationHistoryEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<ApiErrorDisplay | null>(null);
  const [regressions, setRegressions] = useState<OperationRegression[]>([]);
  const [regressionsLoading, setRegressionsLoading] = useState(false);
  const [regressionsError, setRegressionsError] = useState<ApiErrorDisplay | null>(null);
  const [selectedHistoryEventId, setSelectedHistoryEventId] = useState<string | null>(null);
  const [replayInFlightEventId, setReplayInFlightEventId] = useState<string | null>(null);
  const [replayNotice, setReplayNotice] = useState<string | null>(null);
  const [replayError, setReplayError] = useState<ApiErrorDisplay | null>(null);

  const historyRequestInFlightRef = useRef(false);
  const regressionsRequestInFlightRef = useRef(false);

  const selectedHistoryEvent =
    historyEvents.find((event) => event.id === selectedHistoryEventId) || null;

  const refreshOperationHistory = useCallback(async () => {
    await refreshOperationHistoryWithDeps({
      inFlightRef: historyRequestInFlightRef,
      setHistoryLoading,
      setHistoryError,
      setHistoryEvents,
      setSelectedHistoryEventId,
    });
  }, []);

  const refreshOperationRegressions = useCallback(async () => {
    await refreshOperationRegressionsWithDeps({
      inFlightRef: regressionsRequestInFlightRef,
      setRegressionsLoading,
      setRegressionsError,
      setRegressions,
    });
  }, []);

  const clearReplayState = useCallback(() => {
    setReplayNotice(null);
    setReplayError(null);
  }, []);

  useEffect(() => {
    clearReplayState();
  }, [selectedHistoryEventId, clearReplayState]);

  const replaySelectedOperation = useCallback(async () => {
    await replaySelectedOperationWithDeps({
      selectedHistoryEvent,
      replayInFlightEventId,
      setReplayInFlightEventId,
      setReplayNotice,
      setReplayError,
      refreshOperationHistory,
      refreshOperationRegressions,
    });
  }, [
    replayInFlightEventId,
    refreshOperationHistory,
    refreshOperationRegressions,
    selectedHistoryEvent,
  ]);

  return {
    historyEvents,
    historyLoading,
    historyError,
    regressions,
    regressionsLoading,
    regressionsError,
    selectedHistoryEventId,
    replayInFlightEventId,
    replayNotice,
    replayError,
    selectedHistoryEvent,
    refreshOperationHistory,
    refreshOperationRegressions,
    setSelectedHistoryEventId,
    replaySelectedOperation,
    clearReplayState,
  };
}
