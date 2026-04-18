import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { checkTokenValidity } from './audit-consistency-checks.js';

test('checkTokenValidity reports token issues for both markdown and spec files', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-consistency-'));
  try {
    const docsRoot = path.join(tempRoot, 'design-systems', 'sys-test', 'docs', 'components');
    const specRoot = path.join(tempRoot, 'design-systems', 'sys-test', 'docs', '_spec', 'components');
    const registryPath = path.join(tempRoot, 'design-systems', 'sys-test', 'docs', '_generated', 'token-registry.json');
    const markdownPath = path.join(docsRoot, 'button.md');
    const specPath = path.join(specRoot, 'button.yml');

    fs.mkdirSync(docsRoot, { recursive: true });
    fs.mkdirSync(specRoot, { recursive: true });
    fs.mkdirSync(path.dirname(registryPath), { recursive: true });

    fs.writeFileSync(
      markdownPath,
      [
        '# Button',
        '',
        'Token ref: `color.missing`',
        '',
      ].join('\n'),
      'utf8',
    );

    fs.writeFileSync(
      specPath,
      [
        'name: button',
        'status: draft',
        'token: color.missing',
        '',
      ].join('\n'),
      'utf8',
    );

    fs.writeFileSync(
      registryPath,
      JSON.stringify(
        {
          entries: [{ path: 'color.primary', slashPath: 'color/primary' }],
          byPath: { 'color.primary': { value: '#000000' } },
          bySlashPath: { 'color/primary': { value: '#000000' } },
        },
        null,
        2,
      ),
      'utf8',
    );

    const result = checkTokenValidity({
      markdownPath,
      specPath,
      docsRoot,
      registryPath,
    });

    assert.equal(result.ok, false);
    assert.ok(result.errors.some((finding) => finding?.file === markdownPath));
    assert.ok(result.errors.some((finding) => finding?.file === specPath));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
