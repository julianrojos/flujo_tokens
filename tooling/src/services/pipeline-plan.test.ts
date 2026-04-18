import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { createPlan } from './pipeline-plan.js';

function createTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function uniqueId(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

describe('pipeline-plan', () => {
  it('returns empty plan in planning-only mode when registry is missing', async () => {
    const tmpDir = createTempDir('pipeline-plan-missing-registry-');
    const missingRegistryPath = path.join(tmpDir, 'missing', 'registry.db');

    const plan = await createPlan({
      allowMissingRegistry: true,
      dsContext: {
        paths: {
          registry: missingRegistryPath,
        },
      } as any,
    });

    assert.deepStrictEqual(Object.keys(plan.components), []);
    assert.ok(typeof plan.summary.warning === 'string');
  });

  it('keeps markdown step unblocked when --from-step=markdown and spec is skipped intentionally', async () => {
    const tmpDir = createTempDir('pipeline-plan-from-step-');
    const systemId = uniqueId('sys');
    const componentSlug = uniqueId('alert');

    const plan = await createPlan({
      'from-step': 'markdown',
      loadRegistryEntries: async () => [
        {
          slug: componentSlug,
          spec: { exists: false },
          doc: { exists: false, status: 'draft' },
          figma: { component_set_node_id: '12:34' },
          visual_proof: { exists: false },
        },
      ],
      dsContext: {
        id: systemId,
        docsDir: tmpDir,
        paths: {
          registry: path.join(tmpDir, 'registry.db'),
          databaseUrl: 'postgres://ignored:ignored@localhost:5432/ignored',
        },
      } as any,
    });

    const alertPlan = plan.components[componentSlug];
    assert.ok(alertPlan);

    const specStep = alertPlan.steps.find((step) => step.id === 'spec');
    const markdownStep = alertPlan.steps.find((step) => step.id === 'markdown');

    assert.ok(specStep);
    assert.ok(markdownStep);
    assert.equal(specStep?.needed, false);
    assert.equal(markdownStep?.needed, true);
    assert.equal(markdownStep?.blocked, false);
  });
});
