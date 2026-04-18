import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { buildComponentRegistry } from './component-registry-build.js';

function makeTempDir(prefix: string): string {
  const base = path.join(process.cwd(), '.tmp-tests');
  fs.mkdirSync(base, { recursive: true });
  return fs.mkdtempSync(path.join(base, prefix));
}

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

describe('component-registry-build', () => {
  it('builds registry without render fields and classifies markdown stage', () => {
    const root = makeTempDir('registry-build-');
    const specsDir = path.join(root, 'specs');
    const docsDir = path.join(root, 'docs');
    const proofsDir = path.join(root, 'proofs');

    writeFile(
      path.join(specsDir, 'button.yml'),
      [
        'name: button',
        'status: draft',
        'figma:',
        "  component_set_node_id: '1:2'",
        '',
      ].join('\n'),
    );

    writeFile(
      path.join(docsDir, 'button.md'),
      ['# Button', ''].join('\n'),
    );

    const registry = buildComponentRegistry({ specsDir, docsDir, proofsDir });

    assert.equal(registry.summary.total_components, 1);
    assert.equal(registry.summary.with_spec, 1);
    assert.equal(registry.summary.with_doc, 1);
    assert.equal(registry.summary.with_visual_proof, 0);
    assert.equal(registry.summary.by_pipeline_stage['markdown'], 1);
    assert.equal((registry.summary.by_pipeline_stage as Record<string, number>).render, undefined);

    const item = registry.components[0];
    assert.ok(item);
    assert.equal(item.pipeline_stage, 'markdown');
    assert.equal('render_payload' in item.paths, false);
    assert.equal(Object.prototype.hasOwnProperty.call(item, 'render'), false);
  });
});
