import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import { bootstrapDatabase } from '../../../apps/ds-dashboard/server/db/db-service.js';
import { ComponentRepository } from '../../../apps/ds-dashboard/server/db/component-repository.js';
import { createPlan } from './pipeline-plan.js';

function createTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('pipeline-plan', () => {
  it('returns empty plan in planning-only mode when registry is missing', () => {
    const tmpDir = createTempDir('pipeline-plan-missing-registry-');
    const missingRegistryPath = path.join(tmpDir, 'missing', 'registry.db');

    const plan = createPlan({
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

  it('keeps markdown step unblocked when --from-step=markdown and spec is skipped intentionally', () => {
    const tmpDir = createTempDir('pipeline-plan-from-step-');
    const registryPath = path.join(tmpDir, 'registry.db');
    const db = bootstrapDatabase({ dbPath: registryPath });
    try {
      db.exec("INSERT INTO design_systems (id, name) VALUES ('sys-01', 'System 01')");
      const repo = new ComponentRepository(db);
      repo.upsertFromRegistry('sys-01', [
        {
          slug: 'alert',
          name: 'Alert',
          status: 'draft',
          docType: 'component',
          figma: { componentSetNodeId: '12:34' },
        },
      ]);
    } finally {
      db.close();
    }

    const plan = createPlan({
      'from-step': 'markdown',
      dsContext: {
        id: 'sys-01',
        paths: {
          registry: registryPath,
        },
      } as any,
    });

    const alertPlan = plan.components.alert;
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
