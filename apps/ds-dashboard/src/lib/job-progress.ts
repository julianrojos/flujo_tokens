/**
 * Job progress calculation — pure functions only (no React, no DOM, no side-effects).
 *
 * Maps pipeline events to a 0–100% progress value and a human-readable label.
 */

import type { AiJobStatus } from '@/types/ai-jobs';

// ---------------------------------------------------------------------------
// Event → progress percentage
// ---------------------------------------------------------------------------

const EVENT_PROGRESS_MAP: Record<string, number> = {
    'pipeline.started': 5,
    'figma.spec.fetching': 10,
    'figma.spec.fetched': 18,
    'context.prepared': 22,
    'context.variables_enriched': 24,
    'llm.calling': 25,
    'llm.completed': 60,
    'schema.validating': 62,
    'schema.validated': 65,
    'render.completed': 70,
    'editorial.patch_calling': 75,
    'editorial.patch_received': 82,
    'editorial.patch_validated': 88,
    'validation.report_calling': 90,
    'validation.report_received': 93,
    'validation.report_validated': 97,
    'job.completed': 100,
};

/** Events that indicate the job is in a terminal state */
const TERMINAL_EVENTS = new Set(['job.completed', 'job.failed', 'job.cancelled']);

/** Events that trigger the slow-fill timer during long LLM waits */
export const SLOW_FILL_RANGES: Array<{ trigger: string; cap: number }> = [
    { trigger: 'llm.calling', cap: 58 },
    { trigger: 'editorial.patch_calling', cap: 87 },
];

/**
 * Map a single event name to a base progress percentage.
 * Falls back to 2 (preparing) for unknown events.
 */
export function eventToProgress(eventName: string): number {
    return EVENT_PROGRESS_MAP[eventName] ?? 2;
}

/**
 * Check whether an event indicates a terminal job state.
 */
export function isTerminalEvent(eventName: string): boolean {
    return TERMINAL_EVENTS.has(eventName);
}

// ---------------------------------------------------------------------------
// Event → human-readable label
// ---------------------------------------------------------------------------

const EVENT_LABELS: Record<string, string> = {
    'pipeline.started': 'Starting pipeline…',
    'figma.spec.fetching': 'Fetching component from Figma…',
    'figma.spec.fetched': 'Component fetched',
    'context.prepared': 'Context ready',
    'context.variables_enriched': 'Tokens resolved',
    'llm.calling': 'Generating documentation…',
    'llm.completed': 'Documentation generated',
    'schema.validating': 'Validating schema…',
    'schema.validated': 'Schema validated',
    'render.completed': 'Markdown rendered',
    'editorial.patch_calling': 'Applying editorial improvements…',
    'editorial.patch_received': 'Editorial patch received',
    'editorial.patch_validated': 'Editorial patch applied',
    'validation.report_calling': 'Validating quality…',
    'validation.report_received': 'Validation report received',
    'validation.report_validated': 'Validation complete',
    'job.completed': 'Done',
};

const STAGE_LABELS: Record<string, string> = {
    extracting: 'Extracting component info…',
    patching: 'Applying editorial patch…',
    validating: 'Validating quality…',
};

/**
 * Get a human-readable progress label for the given event.
 * Falls back to pipelineStage if the event has no dedicated label.
 */
export function getProgressLabel(eventName: string, pipelineStage?: string | null): string {
    if (EVENT_LABELS[eventName]) return EVENT_LABELS[eventName];
    if (pipelineStage && STAGE_LABELS[pipelineStage]) return STAGE_LABELS[pipelineStage];
    return 'Processing…';
}

/**
 * Check whether the progress bar should be active (rendered).
 * Only 'running' and 'queued' show the progress bar.
 */
export function isProgressActive(status: AiJobStatus): boolean {
    return status === 'running' || status === 'queued';
}

// ---------------------------------------------------------------------------
// Derive progress from event list
// ---------------------------------------------------------------------------

/**
 * Compute the base progress and label from a sorted list of events.
 * Uses the last (highest-seq) event to determine current progress.
 */
export function computeProgressFromEvents(
    events: readonly { event: string }[],
    pipelineStage?: string | null,
): { percent: number; label: string } {
    if (events.length === 0) {
        return { percent: 2, label: 'Preparing…' };
    }
    const lastEvent = events[events.length - 1];
    return {
        percent: eventToProgress(lastEvent.event),
        label: getProgressLabel(lastEvent.event, pipelineStage),
    };
}
