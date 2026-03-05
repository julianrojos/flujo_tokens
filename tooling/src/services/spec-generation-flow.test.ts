/**
 * Spec Generation Flow Tests
 *
 * Tests for runSpecGenerationFlow function.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { runSpecGenerationFlow } from './spec-generation-flow.js';
import type { AgentPromptResult } from '../utils/index.js';

function buildAgentPromptResult(): AgentPromptResult {
  return {
    ok: true,
    agent: 'codex',
    command: 'codex',
    args: [],
    status: 0,
    stdout: '',
    stderr: '',
  };
}

describe('spec-generation-flow', () => {
  describe('runSpecGenerationFlow()', () => {
    it('success path without repair', () => {
      const result = runSpecGenerationFlow({
        prompt: 'prompt',
        agent: 'auto' as const,
        componentName: 'Alert',
        nodeId: '1:1',
        skipValidation: false,
        outputPath: '/tmp/alert.yml',
        registryPath: '/tmp/registry.json',
        runSpecGenerationPromptFn: (): AgentPromptResult => buildAgentPromptResult(),
        runSpecRepairPromptFn: (): AgentPromptResult => { throw new Error('should not run'); },
        validateGeneratedSpecFn: () => ({ ok: true, report: { ok: true }, errors: [] }),
        materializeGeneratedSpec: () => ({ normalizedSpec: { name: 'Alert' }, prefilledCount: 1 }),
      });

      assert.equal(result.prefilledCount, 1);
      assert.deepEqual(result.validationReport, { ok: true });
    });

    it('failed validation triggers repair', () => {
      let validationCalls = 0;
      const result = runSpecGenerationFlow({
        prompt: 'prompt',
        agent: 'auto' as const,
        componentName: 'Alert',
        nodeId: '1:1',
        skipValidation: false,
        outputPath: '/tmp/alert.yml',
        registryPath: '/tmp/registry.json',
        runSpecGenerationPromptFn: (): AgentPromptResult => buildAgentPromptResult(),
        runSpecRepairPromptFn: (): AgentPromptResult => buildAgentPromptResult(),
        validateGeneratedSpecFn: () => {
          validationCalls += 1;
          if (validationCalls === 1) {
            return { ok: false, report: { ok: false }, errors: [{ code: 'SPEC01' }] };
          }
          return { ok: true, report: { ok: true }, errors: [] };
        },
        materializeGeneratedSpec: () => ({ normalizedSpec: { name: 'Alert' }, prefilledCount: 2 }),
      });

      assert.equal(validationCalls, 2);
      assert.equal(result.prefilledCount, 2);
      assert.deepEqual(result.validationReport, { ok: true });
    });

    it('throws after repair if still invalid', () => {
      assert.throws(() =>
        runSpecGenerationFlow({
          prompt: 'prompt',
          agent: 'auto' as const,
          componentName: 'Alert',
          nodeId: '1:1',
          skipValidation: false,
          outputPath: '/tmp/alert.yml',
          registryPath: '/tmp/registry.json',
          runSpecGenerationPromptFn: (): AgentPromptResult => buildAgentPromptResult(),
          runSpecRepairPromptFn: (): AgentPromptResult => buildAgentPromptResult(),
          validateGeneratedSpecFn: () => ({ ok: false, report: { ok: false }, errors: [{ code: 'SPEC01' }] }),
          materializeGeneratedSpec: () => ({ normalizedSpec: { name: 'Alert' }, prefilledCount: 0 }),
        }),
      );
    });
  });
});
