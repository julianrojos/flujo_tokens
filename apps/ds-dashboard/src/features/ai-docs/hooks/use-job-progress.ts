/**
 * useJobProgress hook
 *
 * Derives { percent, label, isActive } from job events, with automatic
 * slow-fill during long LLM waits. Pure calculation — no DOM.
 */

import { useState, useEffect, useRef } from 'react';
import type { AiJobEvent, AiJobStatus } from '@/types/ai-jobs';
import {
    computeProgressFromEvents,
    SLOW_FILL_RANGES,
} from '../lib/job-progress';

// @visible-for-testing — re-export for tests so hook consumers don't depend on lib directly
export { computeProgressFromEvents } from '../lib/job-progress';

type SlowFillConfig = { trigger: string; cap: number } | null;

// @visible-for-testing
export function resolveSlowFillConfig(lastEventName: string | null): SlowFillConfig {
    if (!lastEventName) return null;
    return SLOW_FILL_RANGES.find((r) => r.trigger === lastEventName) ?? null;
}

/**
 * Compute the next slow-fill tick value.
 * Pure function — extracted for testability without React/timer harness.
 *
 * @param prev - Current display percentage
 * @param cap - Maximum percentage for the current slow-fill range
 * @returns Next display percentage (may equal prev if cap is reached)
 */
// @visible-for-testing
export function nextSlowFillPercent(prev: number, cap: number): { value: number; shouldStop: boolean } {
    // Never regress: if we are already at/above cap (e.g. base jumped ahead),
    // stop slow-fill and keep current value.
    if (prev >= cap) {
        return { value: prev, shouldStop: true };
    }
    const next = prev + 1;
    if (next >= cap) {
        return { value: cap, shouldStop: true };
    }
    return { value: next, shouldStop: false };
}

// @visible-for-testing
export function shouldResetAfterRetry(prevDisplay: number, newBase: number): boolean {
    return prevDisplay === 100 && newBase < 100;
}

/**
 * @returns Progress state for the current job
 */
export function useJobProgress(
    events: readonly AiJobEvent[],
    status: AiJobStatus,
    pipelineStage?: string | null,
): { percent: number; label: string; isActive: boolean } {
    const isActive = status === 'running' || status === 'queued';

    // Contract: events MUST be pre-sorted by seq (caller responsibility).
    // See: ai-job-status-card.tsx — the useMemo that merges SSE + polling events
    // already sorts by seq before passing to this hook.
    const lastEvent = events.length > 0 ? events[events.length - 1] : null;

    const base = computeProgressFromEvents(events, pipelineStage);
    const [displayPercent, setDisplayPercent] = useState(base.percent);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const displayPercentRef = useRef(displayPercent);
    const slowFillRef = useRef<SlowFillConfig>(null);

    useEffect(() => {
        displayPercentRef.current = displayPercent;
    }, [displayPercent]);

    // Always cleanup interval on unmount.
    useEffect(() => {
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, []);

    // Clear interval on unmount or when job is no longer active
    useEffect(() => {
        if (!isActive) {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            slowFillRef.current = null;
            if (status === 'completed') {
                setDisplayPercent(100);
                displayPercentRef.current = 100;
            } else {
                setDisplayPercent(0);
                displayPercentRef.current = 0;
            }
            return;
        }

        // Re-activation guard (retry on same mounted card): if the previous run
        // ended at 100 and a new pipeline starts (<100), reset to new base.
        if (shouldResetAfterRetry(displayPercentRef.current, base.percent)) {
            setDisplayPercent(base.percent);
            displayPercentRef.current = base.percent;
        }

        // If basePercent jumped ahead (new event arrived), snap to it
        if (base.percent > displayPercentRef.current) {
            setDisplayPercent(base.percent);
            displayPercentRef.current = base.percent;
        }

        // Monotonically increase: only update if new base is higher
        if (base.percent < displayPercentRef.current) {
            // Out-of-order late event — ignore to keep monotonically increasing display
            return;
        }

        // Check if we should activate slow-fill
        const slowFillRange = resolveSlowFillConfig(lastEvent?.event ?? null);

        if (slowFillRange) {
            const changed =
                slowFillRef.current?.trigger !== slowFillRange.trigger
                || slowFillRef.current?.cap !== slowFillRange.cap;

            // Keep current interval if configuration has not changed.
            if (!changed && intervalRef.current) {
                return;
            }

            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }

            slowFillRef.current = slowFillRange;
            intervalRef.current = setInterval(() => {
                const current = displayPercentRef.current;
                const { value, shouldStop } = nextSlowFillPercent(current, slowFillRange.cap);

                if (value !== current) {
                    setDisplayPercent(value);
                    displayPercentRef.current = value;
                }

                if (shouldStop && intervalRef.current) {
                    clearInterval(intervalRef.current);
                    intervalRef.current = null;
                }
            }, 3000);
        } else {
            // Not in a slow-fill range — clear any existing interval
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            slowFillRef.current = null;
        }
        // NOTE: displayPercent is intentionally omitted from deps.
        // We read/write displayPercentRef.current to avoid interval recreation
        // on each slow-fill tick (which would freeze perceived progress).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isActive, status, base.percent, lastEvent?.event]);

    // Determine label and percent based on current state
    let percent: number;
    let label: string;

    if (!isActive) {
        if (status === 'completed') {
            percent = 100;
            label = 'Done';
        } else if (status === 'failed' || status === 'cancelled') {
            percent = 0;
            label = '';
        } else {
            percent = displayPercent;
            label = base.label;
        }
    } else {
        percent = displayPercent;
        label = base.label;
    }

    return { percent, label, isActive };
}
