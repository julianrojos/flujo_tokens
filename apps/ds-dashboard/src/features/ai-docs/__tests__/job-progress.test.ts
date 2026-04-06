/**
 * job-progress.ts — unit tests for pure functions
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    eventToProgress,
    getProgressLabel,
    isTerminalEvent,
    computeProgressFromEvents,
    isProgressActive,
    SLOW_FILL_RANGES,
} from '../lib/job-progress';

describe('job-progress', () => {
    describe('eventToProgress', () => {
        it('returns known progress values for pipeline events', () => {
            assert.equal(eventToProgress('pipeline.started'), 5);
            assert.equal(eventToProgress('figma.spec.fetching'), 10);
            assert.equal(eventToProgress('figma.spec.fetched'), 18);
            assert.equal(eventToProgress('context.prepared'), 22);
            assert.equal(eventToProgress('context.variables_enriched'), 24);
            assert.equal(eventToProgress('llm.calling'), 25);
            assert.equal(eventToProgress('llm.completed'), 60);
            assert.equal(eventToProgress('schema.validated'), 65);
            assert.equal(eventToProgress('render.completed'), 70);
            assert.equal(eventToProgress('editorial.patch_calling'), 75);
            assert.equal(eventToProgress('editorial.patch_validated'), 88);
            assert.equal(eventToProgress('validation.report_calling'), 90);
            assert.equal(eventToProgress('validation.report_validated'), 97);
            assert.equal(eventToProgress('job.completed'), 100);
        });

        it('returns fallback 2 for unknown events', () => {
            assert.equal(eventToProgress('unknown.event'), 2);
            assert.equal(eventToProgress('something.random'), 2);
        });

        it('progress is monotonically increasing across the pipeline', () => {
            const orderedEvents = [
                'pipeline.started',
                'figma.spec.fetching',
                'figma.spec.fetched',
                'context.prepared',
                'context.variables_enriched',
                'llm.calling',
                'llm.completed',
                'schema.validated',
                'render.completed',
                'editorial.patch_calling',
                'editorial.patch_validated',
                'validation.report_calling',
                'validation.report_validated',
                'job.completed',
            ];
            let prev = 0;
            for (const event of orderedEvents) {
                const val = eventToProgress(event);
                assert.ok(val >= prev, `${event}: ${val} should be >= ${prev}`);
                prev = val;
            }
        });
    });

    describe('getProgressLabel', () => {
        it('returns label for known events', () => {
            assert.ok(getProgressLabel('figma.spec.fetching', null).includes('Figma'));
            assert.ok(getProgressLabel('llm.calling', null).includes('Generating'));
            assert.ok(getProgressLabel('job.completed', null).includes('Done'));
        });

        it('uses pipelineStage as fallback for unknown events', () => {
            const label = getProgressLabel('unknown.event', 'extracting');
            assert.ok(label.includes('Extracting') || label.includes('extracting'));
        });

        it('returns generic fallback when neither event nor stage matches', () => {
            assert.equal(getProgressLabel('unknown.event', null), 'Processing…');
        });
    });

    describe('isTerminalEvent', () => {
        it('returns true for terminal events', () => {
            assert.equal(isTerminalEvent('job.completed'), true);
            assert.equal(isTerminalEvent('job.failed'), true);
            assert.equal(isTerminalEvent('job.cancelled'), true);
        });

        it('returns false for non-terminal events', () => {
            assert.equal(isTerminalEvent('llm.calling'), false);
            assert.equal(isTerminalEvent('pipeline.started'), false);
        });
    });

    describe('computeProgressFromEvents', () => {
        it('returns fallback for empty events', () => {
            const result = computeProgressFromEvents([]);
            assert.equal(result.percent, 2);
            assert.equal(result.label, 'Preparing…');
        });

        it('derives progress from last event', () => {
            const events = [
                { event: 'pipeline.started' },
                { event: 'llm.calling' },
            ];
            const result = computeProgressFromEvents(events);
            assert.equal(result.percent, 25);
        });

        it('passes pipelineStage to label fallback', () => {
            const events = [{ event: 'unknown.xyz' }];
            const result = computeProgressFromEvents(events, 'patching');
            assert.ok(result.label.includes('patch') || result.label.includes('Editorial'));
        });
    });

    describe('SLOW_FILL_RANGES', () => {
        it('has entries for llm.calling and editorial.patch_calling', () => {
            const triggers = SLOW_FILL_RANGES.map(r => r.trigger);
            assert.ok(triggers.includes('llm.calling'));
            assert.ok(triggers.includes('editorial.patch_calling'));
        });

        it('caps are in valid ranges (25–58 and 75–87)', () => {
            const llm = SLOW_FILL_RANGES.find(r => r.trigger === 'llm.calling');
            const editorial = SLOW_FILL_RANGES.find(r => r.trigger === 'editorial.patch_calling');
            assert.ok(llm && llm.cap > 25 && llm.cap <= 58);
            assert.ok(editorial && editorial.cap > 75 && editorial.cap <= 87);
        });
    });

    describe('isProgressActive', () => {
        it('returns true for running status', () => {
            assert.equal(isProgressActive('running'), true);
        });

        it('returns true for queued status', () => {
            assert.equal(isProgressActive('queued'), true);
        });

        it('returns false for completed status', () => {
            assert.equal(isProgressActive('completed'), false);
        });

        it('returns false for failed status', () => {
            assert.equal(isProgressActive('failed'), false);
        });

        it('returns false for pending/cancelled status', () => {
            assert.equal(isProgressActive('pending'), false);
            assert.equal(isProgressActive('cancelled'), false);
        });
    });
});
