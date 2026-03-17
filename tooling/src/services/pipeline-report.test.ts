import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildReportData,
  formatFailureSummary,
  formatOrphanReport,
  formatStats,
  generateReport,
} from './pipeline-report.js';
import type { PipelineExecutionState } from './pipeline-types.js';
import type { PipelineComponent, PipelinePlan, PipelineStep } from './pipeline-plan.js';

const createNeededStep = (id: PipelineStep['id']): PipelineStep => ({
  id,
  desc: `${id} step`,
  needed: true,
  reason: 'Needed for test coverage',
  preconditions: [],
  blocked: false,
});

const createComponent = (component: PipelineComponent): PipelineComponent => component;

const createPlan = (): PipelinePlan => ({
  components: {
    alert: createComponent({
      slug: 'alert',
      figma_node_id: '123:456',
      orphanStatus: false,
      steps: [createNeededStep('spec')],
    }),
    badge: createComponent({
      slug: 'badge',
      figma_node_id: '789:012',
      orphanStatus: false,
      steps: [createNeededStep('markdown')],
    }),
  },
  orphans: {
    figma_only: [],
    doc_only: [],
    spec_only: [],
  },
  summary: {
    totalComponents: 2,
    orphanCount: 0,
  },
});

const createExecutionState = (): PipelineExecutionState => ({
  global: {
    tokensSync: 'Success',
    finalGate: 'Validation Failed',
  },
  components: {
    alert: {
      success: false,
      executedSteps: ['spec'],
      failedSteps: ['markdown'],
    },
    badge: {
      success: true,
      executedSteps: ['spec', 'markdown'],
      failedSteps: [],
    },
  },
});

const captureConsoleLogs = (run: () => void): string[] => {
  const originalLog = console.log;
  const messages: string[] = [];

  console.log = (...args: unknown[]) => {
    messages.push(args.map((value) => String(value)).join(' '));
  };

  try {
    run();
  } finally {
    console.log = originalLog;
  }

  return messages;
};

describe('pipeline-report service', () => {
  describe('buildReportData', () => {
    it('marks success false and preserves failed components when failures exist', () => {
      const report = buildReportData(
        createPlan(),
        createExecutionState(),
        { json: true },
        { hasFailures: true, failedComponents: ['alert'] }
      );

      assert.strictEqual(report.success, false);
      assert.deepStrictEqual(report.failedComponents, ['alert']);
      assert.ok(typeof report.timestamp === 'string');
      assert.deepStrictEqual((report.executionSummary as { plan: PipelinePlan['components'] }).plan, createPlan().components);
    });

    it('marks success true when there are no failures', () => {
      const report = buildReportData(
        createPlan(),
        createExecutionState(),
        { json: true },
        { hasFailures: false, failedComponents: [] }
      );

      assert.strictEqual(report.success, true);
      assert.deepStrictEqual(report.failedComponents, []);
    });
  });

  describe('format helpers', () => {
    it('returns stats summary using execution outcomes', () => {
      const output = formatStats(createPlan(), createExecutionState());

      assert.match(output, /processed: 1/);
      assert.match(output, /errors: 1/);
      assert.match(output, /skipped \(cached\): 0/);
    });

    it('returns empty failure summary when there are no failures', () => {
      assert.strictEqual(formatFailureSummary({ hasFailures: false, failedComponents: [] }), '');
    });

    it('includes orphan categories when present', () => {
      const plan = createPlan();
      plan.orphans.figma_only.push('chip');
      plan.orphans.doc_only.push('legacy_card');
      plan.orphans.spec_only.push('tooltip');

      const output = formatOrphanReport(plan);

      assert.match(output, /Figma Only/);
      assert.match(output, /Doc Only/);
      assert.match(output, /Spec Only/);
    });
  });

  describe('generateReport', () => {
    it('prints JSON report with success false when failures exist', () => {
      const messages = captureConsoleLogs(() => {
        generateReport(
          createPlan(),
          createExecutionState(),
          { json: true },
          { hasFailures: true, failedComponents: ['alert'] }
        );
      });

      assert.strictEqual(messages.length, 1);
      const parsed = JSON.parse(messages[0]) as {
        success: boolean;
        failedComponents: string[];
      };
      assert.strictEqual(parsed.success, false);
      assert.deepStrictEqual(parsed.failedComponents, ['alert']);
    });

    it('prints JSON report with success true when there are no failures', () => {
      const messages = captureConsoleLogs(() => {
        generateReport(
          createPlan(),
          createExecutionState(),
          { json: true },
          { hasFailures: false, failedComponents: [] }
        );
      });

      assert.strictEqual(messages.length, 1);
      const parsed = JSON.parse(messages[0]) as {
        success: boolean;
        failedComponents: string[];
      };
      assert.strictEqual(parsed.success, true);
      assert.deepStrictEqual(parsed.failedComponents, []);
    });
  });
});
