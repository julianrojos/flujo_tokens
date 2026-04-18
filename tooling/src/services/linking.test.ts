import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { validateOverviewLinks } from './linking.js';
import type { DocsValidationReport } from './docs-validator-types.js';

function makeTempDir(prefix: string): string {
  const base = path.join(process.cwd(), '.tmp-tests');
  fs.mkdirSync(base, { recursive: true });
  return fs.mkdtempSync(path.join(base, prefix));
}

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function createReport(): DocsValidationReport {
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    governance: {
      manifestPath: '',
      manifestLoaded: false,
    },
    summary: {
      filesChecked: 0,
      tokenRefsChecked: 0,
      tokenRefsInvalid: 0,
      errors: 0,
      warnings: 0,
    },
    errors: [],
    warnings: [],
  };
}

describe('linking', () => {
  it('allows an overview component list without entries when no component docs exist', () => {
    const docsRoot = makeTempDir('linking-empty-overview-');
    writeFile(
      path.join(docsRoot, 'overview.md'),
      [
        '# Components',
        '',
        '## Component list',
        '',
        '_No design system has been imported yet. Import one to populate this list._',
        '',
      ].join('\n'),
    );

    const report = createReport();
    validateOverviewLinks({
      docsRoot,
      componentFiles: [],
      report,
    });

    assert.equal(report.errors.some((item) => item.code === 'LINK02'), false);
  });

  it('reports LINK02 when list has no valid entries but component docs exist', () => {
    const docsRoot = makeTempDir('linking-invalid-empty-');
    const componentPath = path.join(docsRoot, 'alert.md');
    writeFile(
      path.join(docsRoot, 'overview.md'),
      [
        '# Components',
        '',
        '## Component list',
        '',
        '_No design system has been imported yet. Import one to populate this list._',
        '',
      ].join('\n'),
    );
    writeFile(componentPath, '# Alert\n');

    const report = createReport();
    validateOverviewLinks({
      docsRoot,
      componentFiles: [componentPath],
      report,
    });

    assert.equal(report.errors.some((item) => item.code === 'LINK02'), true);
  });
});
