import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { buildExpectedComponentRegistry, compareComponentRegistryToSources } from './component-registry-sync.js';
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
    writeFile(path.join(docsDir, 'alert.md'), ['# Alert', ''].join('\n'));

    const currentRegistry = buildExpectedComponentRegistry({
      specsDir,
      docsDir,
      proofsDir,
    });

    const same = await compareComponentRegistryToSources({
      systemId,
      specsDir,
      docsDir,
      proofsDir,
      currentRegistry,
    });

    assert.equal(same.exists, true);
    assert.equal(same.matches, true);
  });

  it('syncDocumentationState converges after markdown deletion (clears stale specs)', async () => {
    const systemId = uniqueSystemId('sys-reg-sync-2');
    const root = makeTempDir('registry-sync-converge-');
    const specsDir = path.join(root, 'specs');
    const docsDir = path.join(root, 'docs');
    const proofsDir = path.join(root, 'proofs');
    const overviewPath = path.join(docsDir, 'overview.md');

    writeFile(path.join(specsDir, 'alert.yml'), 'name: alert\nstatus: draft\n');
    writeFile(path.join(docsDir, 'alert.md'), ['# Alert', ''].join('\n'));
    writeFile(overviewPath, '# Components\n\n## Component list\n\n');

    let currentEntries: Array<{
      slug: string;
      name: string;
      status: string;
      docType: string;
      figma?: { fileUrl?: string; componentSetNodeId?: string };
      specs?: Array<{
        markdownPath: string;
        docStatus: 'draft' | 'ready' | 'needs-review';
        coverage: number;
      }>;
    }> = [];

    fs.unlinkSync(path.join(docsDir, 'alert.md'));

    const second = await syncDocumentationState({
      systemId,
      specsDir,
      docsDir,
      proofsDir,
      overviewPath,
      currentEntries,
      setCurrentEntries: async (entries) => {
        currentEntries = entries.map((entry) => ({
          slug: entry.slug,
          name: entry.name,
          status: entry.status,
          docType: entry.docType,
          figma: {
            fileUrl: entry.figma?.fileUrl,
            componentSetNodeId: entry.figma?.componentSetNodeId,
          },
          specs: entry.specs?.map((spec) => ({
            markdownPath: spec.markdownPath,
            docStatus: spec.docStatus,
            coverage: spec.coverage,
          })),
        }));
      },
      imported: true,
    });
    assert.equal(second.registry.changed, true);

    const third = await syncDocumentationState({
      systemId,
      specsDir,
      docsDir,
      proofsDir,
      overviewPath,
      dryRun: true,
      currentEntries,
      imported: true,
    });
    assert.equal(third.registry.changed, false);
  });

  it('ignores historical missing components when evaluating registry drift in dry-run', async () => {
    const systemId = uniqueSystemId('sys-reg-sync-3');
    const root = makeTempDir('registry-sync-missing-history-');
    const specsDir = path.join(root, 'specs');
    const docsDir = path.join(root, 'docs');
    const proofsDir = path.join(root, 'proofs');
    const overviewPath = path.join(docsDir, 'overview.md');

    writeFile(path.join(specsDir, 'alert.yml'), 'name: alert\nstatus: draft\n');
    writeFile(path.join(docsDir, 'alert.md'), ['# Alert', ''].join('\n'));
    writeFile(overviewPath, '# Components\n');

    const baseCurrentEntries = [
      {
        slug: 'alert',
        name: 'Alert',
        status: 'draft',
        docType: 'component',
        figma: { componentSetNodeId: '10:20' },
        specs: [
          {
            markdownPath: path.relative(
              process.cwd(),
              path.join(docsDir, 'alert.md'),
            ),
            docStatus: 'draft' as const,
            coverage: 100,
          },
        ],
      },
    ];

    const beforeMissing = await syncDocumentationState({
      systemId,
      specsDir,
      docsDir,
      proofsDir,
      overviewPath,
      dryRun: true,
      currentEntries: baseCurrentEntries,
      imported: true,
    });

    const afterMissing = await syncDocumentationState({
      systemId,
      specsDir,
      docsDir,
      proofsDir,
      overviewPath,
      dryRun: true,
      currentEntries: [
        ...baseCurrentEntries,
        {
          slug: 'legacy-missing',
          name: 'Legacy Missing',
          status: 'missing',
          docType: 'component',
          figma: { componentSetNodeId: '' },
          specs: [],
        },
      ],
      imported: true,
    });

    assert.equal(afterMissing.registry.changed, beforeMissing.registry.changed);
  });

  it('marks overview list state as not-imported when design system has not been imported yet', async () => {
    const systemId = uniqueSystemId('sys-reg-sync-4');
    const root = makeTempDir('registry-sync-not-imported-');
    const specsDir = path.join(root, 'specs');
    const docsDir = path.join(root, 'docs');
    const proofsDir = path.join(root, 'proofs');
    const overviewPath = path.join(docsDir, 'overview.md');

    writeFile(overviewPath, '# Components\n\n## Component list\n\n');

    const result = await syncDocumentationState({
      systemId,
      specsDir,
      docsDir,
      proofsDir,
      overviewPath,
      dryRun: true,
      imported: false,
      currentEntries: [],
    });

    assert.equal(result.overview.listState, 'not-imported');
  });

  it('marks overview list state as empty when design system is imported but has no components', async () => {
    const systemId = uniqueSystemId('sys-reg-sync-5');
    const root = makeTempDir('registry-sync-empty-imported-');
    const specsDir = path.join(root, 'specs');
    const docsDir = path.join(root, 'docs');
    const proofsDir = path.join(root, 'proofs');
    const overviewPath = path.join(docsDir, 'overview.md');

    writeFile(overviewPath, '# Components\n\n## Component list\n\n');

    const result = await syncDocumentationState({
      systemId,
      specsDir,
      docsDir,
      proofsDir,
      overviewPath,
      dryRun: true,
      imported: true,
      currentEntries: [],
    });

    assert.equal(result.overview.listState, 'empty');
  });
});
