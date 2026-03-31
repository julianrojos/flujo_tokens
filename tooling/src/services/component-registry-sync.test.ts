import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { bootstrapDatabase } from '../../../apps/ds-dashboard/server/db/db-service.js';
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

describe('component-registry-sync', () => {
  it('compares registry against sources without render-dir inputs', () => {
    const root = makeTempDir('registry-sync-');
    const specsDir = path.join(root, 'specs');
    const docsDir = path.join(root, 'docs');
    const proofsDir = path.join(root, 'proofs');
    const dbPath = path.join(root, 'registry.db');

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

    const db = bootstrapDatabase({ dbPath });
    try {
      db.exec("INSERT INTO design_systems (id, name) VALUES ('sys-01', 'System 01')");
      const repo = new ComponentRepository(db);
      repo.upsertFromRegistry('sys-01', [
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
      db.close();
    }

    const same = compareComponentRegistryToSources({
      dbPath,
      systemId: 'sys-01',
      specsDir,
      docsDir,
      proofsDir,
    });
    assert.equal(same.exists, true);
    assert.equal(same.matches, true);

    fs.unlinkSync(path.join(docsDir, 'alert.md'));

    const diff = compareComponentRegistryToSources({
      dbPath,
      systemId: 'sys-01',
      specsDir,
      docsDir,
      proofsDir,
    });
    assert.equal(diff.exists, true);
    assert.equal(diff.matches, false);
  });

  it('syncDocumentationState converges after markdown deletion (clears stale specs)', () => {
    const root = makeTempDir('registry-sync-converge-');
    const specsDir = path.join(root, 'specs');
    const docsDir = path.join(root, 'docs');
    const proofsDir = path.join(root, 'proofs');
    const dbPath = path.join(root, 'registry.db');

    writeFile(path.join(specsDir, 'alert.yml'), 'name: alert\nstatus: draft\n');
    writeFile(
      path.join(docsDir, 'alert.md'),
      ['---', 'doc_status: draft', '---', '', '# Alert', ''].join('\n'),
    );

    const db = bootstrapDatabase({ dbPath });
    try {
      db.exec("INSERT INTO design_systems (id, name) VALUES ('sys-01', 'System 01')");
    } finally {
      db.close();
    }

    syncDocumentationState({
      dbPath,
      systemId: 'sys-01',
      specsDir,
      docsDir,
      proofsDir,
    });

    const first = compareComponentRegistryToSources({
      dbPath,
      systemId: 'sys-01',
      specsDir,
      docsDir,
      proofsDir,
    });
    assert.equal(first.matches, true);

    fs.unlinkSync(path.join(docsDir, 'alert.md'));

    syncDocumentationState({
      dbPath,
      systemId: 'sys-01',
      specsDir,
      docsDir,
      proofsDir,
    });

    const second = compareComponentRegistryToSources({
      dbPath,
      systemId: 'sys-01',
      specsDir,
      docsDir,
      proofsDir,
    });
    assert.equal(second.matches, true);
  });

  it('ignores historical missing components when evaluating registry drift in dry-run', () => {
    const root = makeTempDir('registry-sync-missing-history-');
    const specsDir = path.join(root, 'specs');
    const docsDir = path.join(root, 'docs');
    const proofsDir = path.join(root, 'proofs');
    const dbPath = path.join(root, 'registry.db');
    const overviewPath = path.join(docsDir, 'overview.md');

    writeFile(path.join(specsDir, 'alert.yml'), 'name: alert\nstatus: draft\n');
    writeFile(
      path.join(docsDir, 'alert.md'),
      ['---', 'doc_status: draft', '---', '', '# Alert', ''].join('\n'),
    );
    writeFile(overviewPath, '# Components\n');

    const db = bootstrapDatabase({ dbPath });
    try {
      db.exec("INSERT INTO design_systems (id, name) VALUES ('sys-01', 'System 01')");
      const repo = new ComponentRepository(db);
      repo.upsertFromRegistry('sys-01', [
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
      db.close();
    }

    const beforeMissing = syncDocumentationState({
      dbPath,
      systemId: 'sys-01',
      specsDir,
      docsDir,
      proofsDir,
      overviewPath,
      dryRun: true,
    });

    const dbWithMissing = bootstrapDatabase({ dbPath });
    try {
      dbWithMissing.prepare(`
        INSERT INTO components (ds_id, slug, name, status, doc_type)
        VALUES (?, ?, ?, ?, ?)
      `).run('sys-01', 'legacy-missing', 'Legacy Missing', 'missing', 'component');
    } finally {
      dbWithMissing.close();
    }

    const afterMissing = syncDocumentationState({
      dbPath,
      systemId: 'sys-01',
      specsDir,
      docsDir,
      proofsDir,
      overviewPath,
      dryRun: true,
    });

    assert.equal(afterMissing.registry.changed, beforeMissing.registry.changed);
  });

  it('marks overview list state as not-imported when design system has not been imported yet', () => {
    const root = makeTempDir('registry-sync-not-imported-');
    const specsDir = path.join(root, 'specs');
    const docsDir = path.join(root, 'docs');
    const proofsDir = path.join(root, 'proofs');
    const dbPath = path.join(root, 'registry.db');
    const overviewPath = path.join(docsDir, 'overview.md');

    writeFile(overviewPath, '# Components\n\n## Component list\n\n');

    const result = syncDocumentationState({
      dbPath,
      systemId: 'sys-01',
      specsDir,
      docsDir,
      proofsDir,
      overviewPath,
      dryRun: true,
    });

    assert.equal(result.overview.listState, 'not-imported');
  });

  it('marks overview list state as empty when design system is imported but has no components', () => {
    const root = makeTempDir('registry-sync-empty-imported-');
    const specsDir = path.join(root, 'specs');
    const docsDir = path.join(root, 'docs');
    const proofsDir = path.join(root, 'proofs');
    const dbPath = path.join(root, 'registry.db');
    const overviewPath = path.join(docsDir, 'overview.md');

    writeFile(overviewPath, '# Components\n\n## Component list\n\n');

    const db = bootstrapDatabase({ dbPath });
    try {
      db.prepare(`
        INSERT INTO design_systems (id, name, figma_file_id)
        VALUES (?, ?, ?)
      `).run('sys-01', 'System 01', 'FIGMA_FILE_123');
    } finally {
      db.close();
    }

    const result = syncDocumentationState({
      dbPath,
      systemId: 'sys-01',
      specsDir,
      docsDir,
      proofsDir,
      overviewPath,
      dryRun: true,
    });

    assert.equal(result.overview.listState, 'empty');
  });
});
