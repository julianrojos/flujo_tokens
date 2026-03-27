import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  buildExpectedComponentRegistry,
  compareComponentRegistryToSources,
} from './component-registry-sync.js';

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
    const registryPath = path.join(root, 'component-registry.json');

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

    const expected = buildExpectedComponentRegistry({ specsDir, docsDir, proofsDir });
    fs.writeFileSync(registryPath, `${JSON.stringify(expected, null, 2)}\n`, 'utf8');

    const same = compareComponentRegistryToSources({
      registryPath,
      specsDir,
      docsDir,
      proofsDir,
    });
    assert.equal(same.exists, true);
    assert.equal(same.matches, true);

    const drifted = {
      ...expected,
      summary: { ...expected.summary, total_components: 999 },
    };
    fs.writeFileSync(registryPath, `${JSON.stringify(drifted, null, 2)}\n`, 'utf8');

    const diff = compareComponentRegistryToSources({
      registryPath,
      specsDir,
      docsDir,
      proofsDir,
    });
    assert.equal(diff.exists, true);
    assert.equal(diff.matches, false);
  });
});
