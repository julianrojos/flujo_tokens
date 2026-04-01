import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { resolveDocContext } from './doc-from-figma-url-context.js';
import { TempArtifactManager } from './temp-artifacts.js';
import type { ParsedFigmaFileUrl } from './figma-component-map.js';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'doc-from-figma-url-context-'));
}

function removeDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const figmaDescriptor: ParsedFigmaFileUrl = {
  fileKey: 'FILE123',
  fileName: 'Library',
  fileSlug: 'library',
  surface: 'design',
  rootNodeId: '',
  figmaUrl: 'https://www.figma.com/design/FILE123/Library?node-id=1-2',
};

describe('doc-from-figma-url-context', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      removeDir(dir);
    }
    tempDirs.length = 0;
  });

  it('degrades with warning when style reference resolver is missing', async () => {
    const root = createTempDir();
    tempDirs.push(root);
    const docsRootDir = path.join(root, 'docs');
    const componentDocsDir = path.join(docsRootDir, 'components');
    const warnings: string[] = [];

    const ctx = await resolveDocContext(
      {
        'component-name': 'Alert',
      },
      figmaDescriptor,
      figmaDescriptor.figmaUrl,
      'token',
      path.join(docsRootDir, '_generated', 'component-map.json'),
      docsRootDir,
      componentDocsDir,
      path.join(root, 'apps', 'ds-dashboard', 'server', 'db', 'ds-dashboard.db'),
      'sys-test',
      new TempArtifactManager(),
      {
        importStyleReferenceModule: async () => ({}),
        warn: (message: string) => {
          warnings.push(message);
        },
        ci: 'false',
      },
    );

    assert.equal(ctx.styleReferenceStatus, 'missing');
    assert.equal(ctx.styleReferencePath, '');
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Style reference unavailable \(missing\)/);
  });

  it('fails in strict mode when --strict-style-reference=true and resolver is missing', async () => {
    const root = createTempDir();
    tempDirs.push(root);
    const docsRootDir = path.join(root, 'docs');
    const componentDocsDir = path.join(docsRootDir, 'components');
    const warnings: string[] = [];

    await assert.rejects(
      () =>
        resolveDocContext(
          {
            'component-name': 'Alert',
            'strict-style-reference': 'true',
          },
          figmaDescriptor,
          figmaDescriptor.figmaUrl,
          'token',
          path.join(docsRootDir, '_generated', 'component-map.json'),
          docsRootDir,
          componentDocsDir,
          path.join(root, 'apps', 'ds-dashboard', 'server', 'db', 'ds-dashboard.db'),
          'sys-test',
          new TempArtifactManager(),
          {
            importStyleReferenceModule: async () => ({}),
            warn: (message: string) => {
              warnings.push(message);
            },
            ci: 'false',
          },
        ),
      /strict mode/,
    );
    assert.equal(warnings.length, 1);
  });
});
