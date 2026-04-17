import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  bootstrapDatabase,
  resolveDashboardDbUrl,
} from '../../../apps/ds-dashboard/server/db/pg-db-service.js';
import { ComponentRepository } from '../../../apps/ds-dashboard/server/db/component-repository.js';
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
    void tmpDir;
    const systemId = uniqueId('sys');
    const componentSlug = uniqueId('alert');
    const db = await bootstrapDatabase(resolveDashboardDbUrl(process.env));
    try {
      await db`
        INSERT INTO design_systems (id, name)
        VALUES (${systemId}, 'System 01')
        ON CONFLICT (id) DO NOTHING
      `;
      const repo = new ComponentRepository(db);
      await repo.upsertFromRegistry(systemId, [
        {
          slug: componentSlug,
          name: 'Alert',
          status: 'draft',
          docType: 'component',
          figma: { componentSetNodeId: '12:34' },
        },
      ]);
    } finally {
      await db.end();
    }

    const plan = await createPlan({
      'from-step': 'markdown',
      dsContext: {
        id: systemId,
        paths: {
          registry: resolveDashboardDbUrl(process.env),
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
