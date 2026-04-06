/**
 * use-job-progress.ts — unit tests for hook logic
 *
 * Tests the underlying computeProgressFromEvents function (pure logic)
 * exported via the hook with // @visible-for-testing.
 * The slow-fill timer is tested conceptually via SLOW_FILL_RANGES,
 * not via actual setInterval.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    computeProgressFromEvents,
    resolveSlowFillConfig,
    nextSlowFillPercent,
    shouldResetAfterRetry,
} from '../hooks/use-job-progress';
import { SLOW_FILL_RANGES } from '../lib/job-progress';

describe('use-job-progress logic', () => {
    describe('computeProgressFromEvents', () => {
        it('empty events → percent 2, "Preparing…"', () => {
            const result = computeProgressFromEvents([]);
            assert.equal(result.percent, 2);
            assert.equal(result.label, 'Preparing…');
        });

        it('single event → progress for that event', () => {
            const events = [{ event: 'llm.calling' }];
            const result = computeProgressFromEvents(events);
            assert.equal(result.percent, 25);
            assert.ok(result.label.includes('Generating'));
        });

        it('full pipeline → 100% at job.completed', () => {
            const events = [
                { event: 'pipeline.started' },
                { event: 'figma.spec.fetching' },
                { event: 'figma.spec.fetched' },
                { event: 'context.prepared' },
                { event: 'llm.calling' },
                { event: 'llm.completed' },
                { event: 'schema.validated' },
                { event: 'render.completed' },
                { event: 'editorial.patch_calling' },
                { event: 'editorial.patch_validated' },
                { event: 'validation.report_calling' },
                { event: 'validation.report_validated' },
                { event: 'job.completed' },
            ];
            const result = computeProgressFromEvents(events);
            assert.equal(result.percent, 100);
        });

        it('last event determines progress even if out of order', () => {
            const events = [
                { event: 'llm.completed' },
                { event: 'pipeline.started' },
            ];
            const result = computeProgressFromEvents(events);
            // Uses last element in the array (caller must sort by seq)
            assert.equal(result.percent, 5);
        });
    });

    describe('SLOW_FILL_RANGES configuration', () => {
        it('llm.calling cap is above base 25', () => {
            const llm = SLOW_FILL_RANGES.find(r => r.trigger === 'llm.calling');
            assert.ok(llm && llm.cap > 25, 'LLM slow-fill cap should be above 25%');
        });

        it('editorial.patch_calling cap is above base 75', () => {
            const editorial = SLOW_FILL_RANGES.find(r => r.trigger === 'editorial.patch_calling');
            assert.ok(editorial && editorial.cap > 75, 'Editorial slow-fill cap should be above 75%');
        });

        it('caps do not overlap with next milestone', () => {
            const llm = SLOW_FILL_RANGES.find(r => r.trigger === 'llm.calling');
            const editorial = SLOW_FILL_RANGES.find(r => r.trigger === 'editorial.patch_calling');
            // llm cap (58) should be below llm.completed (60)
            assert.ok(llm && llm.cap < 60, 'LLM cap should be below llm.completed (60%)');
            // editorial cap (87) should be below editorial.patch_validated (88)
            assert.ok(editorial && editorial.cap < 88, 'Editorial cap should be below patch_validated (88%)');
        });
    });

    describe('resolveSlowFillConfig', () => {
        it('returns config for llm.calling', () => {
            const cfg = resolveSlowFillConfig('llm.calling');
            assert.equal(cfg?.trigger, 'llm.calling');
            assert.equal(cfg?.cap, 58);
        });

        it('returns config for editorial.patch_calling', () => {
            const cfg = resolveSlowFillConfig('editorial.patch_calling');
            assert.equal(cfg?.trigger, 'editorial.patch_calling');
            assert.equal(cfg?.cap, 87);
        });

        it('returns null for non slow-fill events', () => {
            assert.equal(resolveSlowFillConfig('llm.completed'), null);
            assert.equal(resolveSlowFillConfig('schema.validated'), null);
            assert.equal(resolveSlowFillConfig(null), null);
        });
    });

    describe('nextSlowFillPercent', () => {
        it('increments by 1 when below cap', () => {
            const { value, shouldStop } = nextSlowFillPercent(30, 58);
            assert.equal(value, 31);
            assert.equal(shouldStop, false);
        });

        it('returns cap and shouldStop when next step reaches cap', () => {
            const { value, shouldStop } = nextSlowFillPercent(57, 58);
            assert.equal(value, 58);
            assert.equal(shouldStop, true);
        });

        it('returns cap and shouldStop when already at cap', () => {
            const { value, shouldStop } = nextSlowFillPercent(58, 58);
            // No regression: keep current value when already at cap.
            assert.equal(value, 58);
            assert.equal(shouldStop, true);
        });

        it('caps value when prev exceeds cap', () => {
            const { value, shouldStop } = nextSlowFillPercent(60, 58);
            // No regression: keep current value when already above cap.
            assert.equal(value, 60);
            assert.equal(shouldStop, true);
        });

        it('simulates full LLM slow-fill from base 25 to cap 58', () => {
            let value = 25;
            let steps = 0;
            let shouldStop = false;
            while (!shouldStop && value < 58) {
                const result = nextSlowFillPercent(value, 58);
                value = result.value;
                shouldStop = result.shouldStop;
                steps++;
            }
            assert.equal(value, 58, 'Should reach cap at 58');
            assert.equal(steps, 33, 'Should take 33 steps (58 - 25)');
            assert.equal(shouldStop, true);
        });

        it('simulates full editorial slow-fill from base 75 to cap 87', () => {
            let value = 75;
            let steps = 0;
            let shouldStop = false;
            while (!shouldStop && value < 87) {
                const result = nextSlowFillPercent(value, 87);
                value = result.value;
                shouldStop = result.shouldStop;
                steps++;
            }
            assert.equal(value, 87, 'Should reach cap at 87');
            assert.equal(steps, 12, 'Should take 12 steps (87 - 75)');
            assert.equal(shouldStop, true);
        });

        it('shouldResetAfterRetry returns true for 100 -> <100 transition', () => {
            assert.equal(shouldResetAfterRetry(100, 5), true);
        });

        it('shouldResetAfterRetry returns false when previous display is not terminal', () => {
            assert.equal(shouldResetAfterRetry(58, 5), false);
        });

        it('shouldResetAfterRetry returns false when new base is not restarting', () => {
            assert.equal(shouldResetAfterRetry(100, 100), false);
            assert.equal(shouldResetAfterRetry(100, 120), false);
        });
    });
});
