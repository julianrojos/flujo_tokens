/**
 * Tests for the Design System Pipeline Service
 *
 * These tests validate the pure logic functions in pipeline.ts
 * without any filesystem or I/O dependencies.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  normalizeStepId,
  validateStepId,
  determineOrphanStatus,
  createComponentPlan,
  createPlan,
  normalizeComponentSlug,
  calculateStats,
} from './pipeline.js';

import type { PipelineOptions } from './pipeline-types.js';

describe('pipeline service', () => {
  describe('normalizeStepId', () => {
    it('normalizes canonical step ids', () => {
      assert.strictEqual(normalizeStepId('spec'), 'spec');
      assert.strictEqual(normalizeStepId('markdown'), 'markdown');
      assert.strictEqual(normalizeStepId('render'), 'render');
      assert.strictEqual(normalizeStepId('proof'), 'proof');
    });

    it('normalizes legacy aliases', () => {
      assert.strictEqual(normalizeStepId('figma'), 'render');
      assert.strictEqual(normalizeStepId('visual-proof'), 'proof');
    });

    it('handles case insensitivity', () => {
      assert.strictEqual(normalizeStepId('SPEC'), 'spec');
      assert.strictEqual(normalizeStepId('Markdown'), 'markdown');
      assert.strictEqual(normalizeStepId('RENDER'), 'render');
    });

    it('returns empty string for invalid input', () => {
      assert.strictEqual(normalizeStepId(''), '');
      assert.strictEqual(normalizeStepId('invalid'), '');
      assert.strictEqual(normalizeStepId('  '), '');
    });
  });

  describe('validateStepId', () => {
    it('does not throw for valid step ids', () => {
      assert.doesNotThrow(() => {
        validateStepId('spec', '--from-step');
      });
      assert.doesNotThrow(() => {
        validateStepId('markdown', '--only-step');
      });
      assert.doesNotThrow(() => {
        validateStepId('figma', '--from-step');
      });
    });

    it('throws for invalid step ids', () => {
      assert.throws(() => {
        validateStepId('invalid', '--from-step');
      }, /Invalid --from-step value/);

      assert.throws(() => {
        validateStepId('bad', '--only-step');
      }, /Invalid --only-step value/);
    });

    it('does not throw for empty string', () => {
      assert.doesNotThrow(() => {
        validateStepId('', '--from-step');
      });
    });
  });

  describe('determineOrphanStatus', () => {
    it('returns figma_only when only in Figma', () => {
      const status = determineOrphanStatus({
        hasSpec: false,
        hasDoc: false,
        inFigma: true,
      });
      assert.strictEqual(status, 'figma_only');
    });

    it('returns doc_only when only has doc', () => {
      const status = determineOrphanStatus({
        hasSpec: false,
        hasDoc: true,
        inFigma: false,
      });
      assert.strictEqual(status, 'doc_only');
    });

    it('returns spec_only when only has spec', () => {
      const status = determineOrphanStatus({
        hasSpec: true,
        hasDoc: false,
        inFigma: false,
      });
      assert.strictEqual(status, 'spec_only');
    });

    it('returns null when complete', () => {
      const status = determineOrphanStatus({
        hasSpec: true,
        hasDoc: true,
        inFigma: true,
      });
      assert.strictEqual(status, null);
    });

    it('returns spec_only for spec+doc without figma', () => {
      // Component with spec+doc but not in Figma is NOT an orphan
      // It just needs Figma mapping/rend er
      const status = determineOrphanStatus({
        hasSpec: true,
        hasDoc: true,
        inFigma: false,
      });
      assert.strictEqual(status, null);
    });

    it('returns doc_only for doc without spec and figma', () => {
      // True orphan: has doc but no spec and not in Figma
      const status = determineOrphanStatus({
        hasSpec: false,
        hasDoc: true,
        inFigma: false,
      });
      assert.strictEqual(status, 'doc_only');
    });
  });

  describe('createComponentPlan', () => {
    it('creates plan for complete component', () => {
      const plan = createComponentPlan({
        slug: 'alert',
        hasSpec: true,
        hasDoc: true,
        inFigma: true,
        needsReview: false,
      });

      assert.strictEqual(plan.slug, 'alert');
      assert.strictEqual(plan.orphanStatus, null);
      assert.strictEqual(plan.steps.length, 4);
      assert.strictEqual(plan.hasSpec, true);
      assert.strictEqual(plan.hasDoc, true);
      assert.strictEqual(plan.inFigma, true);
    });

    it('marks steps as needed for new component', () => {
      const plan = createComponentPlan({
        slug: 'new-button',
        hasSpec: false,
        hasDoc: false,
        inFigma: false,
        needsReview: false,
      });

      assert.strictEqual(plan.orphanStatus, null);

      // All steps should be needed
      const neededSteps = plan.steps.filter(s => s.needed);
      assert.strictEqual(neededSteps.length, 4);
    });

    it('identifies figma_only orphan', () => {
      const plan = createComponentPlan({
        slug: 'orphan',
        hasSpec: false,
        hasDoc: false,
        inFigma: true,
        needsReview: false,
      });

      assert.strictEqual(plan.orphanStatus, 'figma_only');
    });

    it('blocks steps when preconditions not met', () => {
      const plan = createComponentPlan({
        slug: 'incomplete',
        hasSpec: false,
        hasDoc: false,
        inFigma: true,
        needsReview: false,
      });

      // Markdown should be blocked because spec is needed
      const markdownStep = plan.steps.find(s => s.id === 'markdown');
      assert.ok(markdownStep);
      assert.strictEqual(markdownStep?.blocked, true);
    });
  });

  describe('createPlan', () => {
    it('creates plan for multiple components', () => {
      const components = [
        {
          slug: 'alert',
          spec: { exists: true },
          doc: { exists: true },
          figma: { component_set_node_id: '123:456' },
        },
        {
          slug: 'button',
          spec: { exists: false },
          doc: { exists: false },
          figma: {},
        },
      ];

      const options: PipelineOptions = {};
      const plan = createPlan(options, components);

      assert.strictEqual(plan.summary.totalComponents, 2);
      assert.ok(plan.components['alert']);
      assert.ok(plan.components['button']);
    });

    it('filters by component name', () => {
      const components = [
        { slug: 'alert', spec: { exists: true }, doc: { exists: true }, figma: {} },
        { slug: 'button', spec: { exists: false }, doc: { exists: false }, figma: {} },
      ];

      const options: PipelineOptions = { component: 'Alert' };
      const plan = createPlan(options, components);

      assert.strictEqual(plan.summary.totalComponents, 1);
      assert.ok(plan.components['alert']);
      assert.strictEqual(plan.components['button'], undefined);
    });

    it('handles --from-step filter', () => {
      const components = [
        { slug: 'test', spec: { exists: false }, doc: { exists: false }, figma: {} },
      ];

      const options: PipelineOptions = { 'from-step': 'markdown' };
      const plan = createPlan(options, components);

      const specStep = plan.components['test'].steps.find(s => s.id === 'spec');
      const markdownStep = plan.components['test'].steps.find(s => s.id === 'markdown');

      // Spec step should be filtered out (not needed) because --from-step starts at markdown
      assert.strictEqual(specStep?.needed, false);
      assert.ok(specStep?.reason?.includes('--from-step'));
      // Markdown should still be needed (it's the starting point)
      assert.strictEqual(markdownStep?.needed, true);
    });

    it('handles --only-step filter', () => {
      const components = [
        { slug: 'test', spec: { exists: false }, doc: { exists: false }, figma: {} },
      ];

      const options: PipelineOptions = { 'only-step': 'markdown' };
      const plan = createPlan(options, components);

      const specStep = plan.components['test'].steps.find(s => s.id === 'spec');
      const markdownStep = plan.components['test'].steps.find(s => s.id === 'markdown');
      const renderStep = plan.components['test'].steps.find(s => s.id === 'render');

      // Only markdown should be needed, others filtered out
      assert.strictEqual(specStep?.needed, false);
      assert.ok(specStep?.reason?.includes('--only-step'));
      assert.strictEqual(markdownStep?.needed, true);
      assert.strictEqual(renderStep?.needed, false);
      assert.ok(renderStep?.reason?.includes('--only-step'));
    });

    it('tracks orphans correctly', () => {
      const components = [
        { slug: 'figma-only', spec: {}, doc: {}, figma: { component_set_node_id: '1:1' } },
        { slug: 'spec-only', spec: { exists: true }, doc: {}, figma: {} },
        { slug: 'doc-only', spec: {}, doc: { exists: true }, figma: {} },
        { slug: 'complete', spec: { exists: true }, doc: { exists: true }, figma: { component_set_node_id: '2:2' } },
      ];

      const options: PipelineOptions = {};
      const plan = createPlan(options, components);

      assert.strictEqual(plan.orphans.figma_only.length, 1);
      assert.strictEqual(plan.orphans.spec_only.length, 1);
      assert.strictEqual(plan.orphans.doc_only.length, 1);
      assert.strictEqual(plan.summary.orphanCount, 3);
    });
  });

  describe('normalizeComponentSlug', () => {
    it('converts PascalCase to snake_case', () => {
      assert.strictEqual(normalizeComponentSlug('AlertButton'), 'alert_button');
      assert.strictEqual(normalizeComponentSlug('StatusBar'), 'status_bar');
    });

    it('converts spaces to underscores', () => {
      assert.strictEqual(normalizeComponentSlug('Alert Button'), 'alert_button');
      assert.strictEqual(normalizeComponentSlug('Status Bar'), 'status_bar');
    });

    it('handles mixed formats', () => {
      assert.strictEqual(normalizeComponentSlug('AlertButton Component'), 'alert_button_component');
      assert.strictEqual(normalizeComponentSlug('status-bar'), 'status_bar');
    });

    it('trims whitespace', () => {
      assert.strictEqual(normalizeComponentSlug('  Alert  '), 'alert');
    });
  });

  describe('calculateStats', () => {
    it('calculates stats for processed components', () => {
      const plan = {
        components: {
          'alert': {
            orphanStatus: null,
            steps: [{ id: 'spec', needed: false, reason: 'Up to date' }],
          },
          'button': {
            orphanStatus: null,
            steps: [{ id: 'spec', needed: true, reason: 'Missing' }],
          },
        },
        orphans: { figma_only: [], doc_only: [], spec_only: [] },
        summary: { totalComponents: 2, orphanCount: 0 },
      };

      const executionState = {
        components: {
          'button': { success: true },
        },
      };

      const stats = calculateStats(plan as any, executionState as any);

      assert.strictEqual(stats.processed, 1);
      assert.strictEqual(stats.errors, 0);
      assert.strictEqual(stats.skippedCached, 1);
      assert.strictEqual(stats.skippedOnlyStep, 0);
    });

    it('counts errors correctly', () => {
      const plan = {
        components: {
          'alert': {
            orphanStatus: null,
            steps: [{ id: 'spec', needed: true, reason: 'Missing' }],
          },
        },
        orphans: { figma_only: [], doc_only: [], spec_only: [] },
        summary: { totalComponents: 1, orphanCount: 0 },
      };

      const executionState = {
        components: {
          'alert': { success: false },
        },
      };

      const stats = calculateStats(plan as any, executionState as any);

      assert.strictEqual(stats.processed, 0);
      assert.strictEqual(stats.errors, 1);
    });

    it('skips orphans', () => {
      const plan = {
        components: {
          'orphan': {
            orphanStatus: 'figma_only',
            steps: [],
          },
        },
        orphans: { figma_only: ['orphan'], doc_only: [], spec_only: [] },
        summary: { totalComponents: 1, orphanCount: 1 },
      };

      const stats = calculateStats(plan as any, {});

      assert.strictEqual(stats.skippedCached, 1);
      assert.strictEqual(stats.processed, 0);
      assert.strictEqual(stats.errors, 0);
    });
  });
});
