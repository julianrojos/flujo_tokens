import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  bootstrapDatabase,
  resolveDashboardDbUrl,
} from '../../../apps/ds-dashboard/server/db/pg-db-service.js';
import { ComponentRepository } from '../../../apps/ds-dashboard/server/db/component-repository.js';
import {
  compareComponentRegistryToSources,
} from './component-registry-sync.js';
import { syncDocumentationState } from './component-registry-refresh.js';

function makeTempDir(prefix: string): string {
  const base = path.join(process.cwd(), '.tmp-tests');
  fs.mkdirSync(base, { recursive: true });
  return fs.mkdtempSync(path.join(base, prefix));
}

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function uniqueSystemId(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

describe('component-registry-sync', () => {
  it('compares registry against sources without render-dir inputs', async () => {
    const systemId = uniqueSystemId('sys-reg-sync-1');
    const root = makeTempDir('registry-sync-');
    const specsDir = path.join(root, 'specs');
    const docsDir = path.join(root, 'docs');
    const proofsDir = path.join(root, 'proofs');
    const databaseUrl = path.join(root, 'registry.db');

    writeFile(
      path.join(specsDir, 'alert.yml'),
      [
        'name: alert',
        'status: draft',
        'figma:',
        "  component_set_node_id: '10:20'",
        '',
      ].join('\n'),
    );

    writeFile(
      path.join(docsDir, 'alert.md'),
      [
        '---',
        'doc_status: draft',
        'figma:',
        "  file_url: 'https://www.figma.com/design/file/Alert?node-id=10-20'",
        "  component_set_node_id: '10:20'",
        '---',
        '',
        '# Alert',
        '',
      ].join('\n'),
    );

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
          slug: 'alert',
          name: 'Alert',
          status: 'draft',
          docType: 'component',
          figma: {
            fileUrl: 'https://www.figma.com/design/file/Alert?node-id=10-20',
            componentSetNodeId: '10:20',
          },
          specs: [
            {
              markdownPath: path.relative(
                process.cwd(),
                path.join(docsDir, 'alert.md'),
              ),
              docStatus: 'draft',
              coverage: 100,
            },
          ],
        },
      ]);
    } finally {
      await db.end();
    }

    const same = await compareComponentRegistryToSources({
      databaseUrl,
      systemId,
      specsDir,
      docsDir,
      proofsDir,
    });
    assert.equal(same.exists, true);
    assert.equal(same.matches, true);

    fs.unlinkSync(path.join(docsDir, 'alert.md'));

    const diff = await compareComponentRegistryToSources({
      databaseUrl,
      systemId,
      specsDir,
      docsDir,
      proofsDir,
    });
    assert.equal(diff.exists, true);
    assert.equal(diff.matches, false);
  });

  it('syncDocumentationState converges after markdown deletion (clears stale specs)', async () => {
    const systemId = uniqueSystemId('sys-reg-sync-2');
    const root = makeTempDir('registry-sync-converge-');
    const specsDir = path.join(root, 'specs');
    const docsDir = path.join(root, 'docs');
    const proofsDir = path.join(root, 'proofs');
    const databaseUrl = path.join(root, 'registry.db');
    const overviewPath = path.join(docsDir, 'overview.md');

    writeFile(path.join(specsDir, 'alert.yml'), 'name: alert\nstatus: draft\n');
    writeFile(
      path.join(docsDir, 'alert.md'),
      ['---', 'doc_status: draft', '---', '', '# Alert', ''].join('\n'),
    );
    writeFile(overviewPath, '# Components\n\n## Component list\n\n');

    const db = await bootstrapDatabase(resolveDashboardDbUrl(process.env));
    try {
      await db`
        INSERT INTO design_systems (id, name)
        VALUES (${systemId}, 'System 01')
        ON CONFLICT (id) DO NOTHING
      `;
    } finally {
      await db.end();
    }

    await syncDocumentationState({
      databaseUrl,
      systemId,
      specsDir,
      docsDir,
      proofsDir,
      overviewPath,
    });

    const first = await compareComponentRegistryToSources({
      databaseUrl,
      systemId,
      specsDir,
      docsDir,
      proofsDir,
    });
    assert.equal(first.matches, true);

    fs.unlinkSync(path.join(docsDir, 'alert.md'));

    await syncDocumentationState({
      databaseUrl,
      systemId,
      specsDir,
      docsDir,
      proofsDir,
      overviewPath,
    });

    const second = await compareComponentRegistryToSources({
      databaseUrl,
      systemId,
      specsDir,
      docsDir,
      proofsDir,
    });
    assert.equal(second.matches, true);
  });

  it('ignores historical missing components when evaluating registry drift in dry-run', async () => {
    const systemId = uniqueSystemId('sys-reg-sync-3');
    const root = makeTempDir('registry-sync-missing-history-');
    const specsDir = path.join(root, 'specs');
    const docsDir = path.join(root, 'docs');
    const proofsDir = path.join(root, 'proofs');
    const databaseUrl = path.join(root, 'registry.db');
    const overviewPath = path.join(docsDir, 'overview.md');

    writeFile(path.join(specsDir, 'alert.yml'), 'name: alert\nstatus: draft\n');
    writeFile(
      path.join(docsDir, 'alert.md'),
      ['---', 'doc_status: draft', '---', '', '# Alert', ''].join('\n'),
    );
    writeFile(overviewPath, '# Components\n');

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
          slug: 'alert',
          name: 'Alert',
          status: 'draft',
          docType: 'component',
          figma: { fileUrl: '', componentSetNodeId: '10:20' },
          specs: [
            {
              markdownPath: path.relative(process.cwd(), path.join(docsDir, 'alert.md')),
              docStatus: 'draft',
              coverage: 100,
            },
          ],
        },
      ]);
    } finally {
      await db.end();
    }

    const beforeMissing = await syncDocumentationState({
      databaseUrl,
      systemId,
      specsDir,
      docsDir,
      proofsDir,
      overviewPath,
      dryRun: true,
    });

    const dbWithMissing = await bootstrapDatabase(resolveDashboardDbUrl(process.env));
    try {
      await dbWithMissing`
        INSERT INTO components (ds_id, slug, name, status, doc_type)
        VALUES (${systemId}, 'legacy-missing', 'Legacy Missing', 'missing', 'component')
      `;
    } finally {
      await dbWithMissing.end();
    }

    const afterMissing = await syncDocumentationState({
      databaseUrl,
      systemId,
      specsDir,
      docsDir,
      proofsDir,
      overviewPath,
      dryRun: true,
    });

    assert.equal(afterMissing.registry.changed, beforeMissing.registry.changed);
  });

  it('marks overview list state as not-imported when design system has not been imported yet', async () => {
    const systemId = uniqueSystemId('sys-reg-sync-4');
    const root = makeTempDir('registry-sync-not-imported-');
    const specsDir = path.join(root, 'specs');
    const docsDir = path.join(root, 'docs');
    const proofsDir = path.join(root, 'proofs');
    const databaseUrl = path.join(root, 'registry.db');
    const overviewPath = path.join(docsDir, 'overview.md');

    writeFile(overviewPath, '# Components\n\n## Component list\n\n');

    const result = await syncDocumentationState({
      databaseUrl,
      systemId,
      specsDir,
      docsDir,
      proofsDir,
      overviewPath,
      dryRun: true,
    });

    assert.equal(result.overview.listState, 'not-imported');
  });

  it('marks overview list state as empty when design system is imported but has no components', async () => {
    const systemId = uniqueSystemId('sys-reg-sync-5');
    const root = makeTempDir('registry-sync-empty-imported-');
    const specsDir = path.join(root, 'specs');
    const docsDir = path.join(root, 'docs');
    const proofsDir = path.join(root, 'proofs');
    const databaseUrl = path.join(root, 'registry.db');
    const overviewPath = path.join(docsDir, 'overview.md');

    writeFile(overviewPath, '# Components\n\n## Component list\n\n');

    const db = await bootstrapDatabase(resolveDashboardDbUrl(process.env));
    try {
      await db`
        INSERT INTO design_systems (id, name, figma_file_id)
        VALUES (${systemId}, 'System 01', 'FIGMA_FILE_123')
        ON CONFLICT (id) DO UPDATE SET figma_file_id = EXCLUDED.figma_file_id
      `;
    } finally {
      await db.end();
    }

    const result = await syncDocumentationState({
      databaseUrl,
      systemId,
      specsDir,
      docsDir,
      proofsDir,
      overviewPath,
      dryRun: true,
    });

    assert.equal(result.overview.listState, 'empty');
  });
});
