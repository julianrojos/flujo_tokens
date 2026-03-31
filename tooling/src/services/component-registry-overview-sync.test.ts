import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  buildComponentListLines,
  OVERVIEW_EMPTY_STATE_LINE,
  OVERVIEW_NOT_IMPORTED_STATE_LINE,
  syncComponentOverview,
} from './component-registry-overview-sync.js';
import type { ComponentRegistry } from '../types/component-registry.js';

function makeTempDir(prefix: string): string {
  const base = path.join(process.cwd(), '.tmp-tests');
  fs.mkdirSync(base, { recursive: true });
  return fs.mkdtempSync(path.join(base, prefix));
}

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function createRegistry(components: unknown[]): ComponentRegistry {
  return {
    schema_version: 1,
    components: components as ComponentRegistry['components'],
    summary: {
      total_components: components.length,
      with_spec: 0,
      with_doc: 0,
      with_visual_proof: 0,
      ready_for_publish: 0,
      by_pipeline_stage: {
        'missing-spec': 0,
        spec: 0,
        markdown: 0,
        'visual-proof': 0,
      },
    },
    fingerprint_sha256: 'test-fingerprint',
  };
}

describe('component-registry-overview-sync', () => {
  it('buildComponentListLines keeps canonical alphabetical ordering for docs that exist', () => {
    const lines = buildComponentListLines([
      { slug: 'toast', display_name: 'Toast', doc: { exists: true } },
      { slug: 'alert', display_name: 'Alert', doc: { exists: true } },
      { slug: 'badge', display_name: 'Badge', doc: { exists: false } },
    ]);

    assert.deepEqual(lines, [
      '- [Alert](alert.md)',
      '- [Toast](toast.md)',
    ]);
  });

  it('writes a not-imported placeholder when there are no components yet', () => {
    const root = makeTempDir('overview-not-imported-');
    const overviewPath = path.join(root, 'overview.md');
    writeFile(overviewPath, '# Components\n\n## Component list\n\n');

    const result = syncComponentOverview({
      overviewPath,
      registry: createRegistry([]),
      listState: 'not-imported',
    });

    const updated = fs.readFileSync(overviewPath, 'utf8');
    assert.equal(result.listState, 'not-imported');
    assert.equal(result.componentCount, 0);
    assert.equal(updated.includes(OVERVIEW_NOT_IMPORTED_STATE_LINE), true);
  });

  it('writes an empty-state placeholder when system is imported but has no components', () => {
    const root = makeTempDir('overview-empty-');
    const overviewPath = path.join(root, 'overview.md');
    writeFile(overviewPath, '# Components\n\n## Component list\n\n');

    const result = syncComponentOverview({
      overviewPath,
      registry: createRegistry([]),
      listState: 'empty',
    });

    const updated = fs.readFileSync(overviewPath, 'utf8');
    assert.equal(result.listState, 'empty');
    assert.equal(result.componentCount, 0);
    assert.equal(updated.includes(OVERVIEW_EMPTY_STATE_LINE), true);
  });
});
