import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { executeCaptureBatchAndRefresh } from './capture-batch-execution.js';

describe('capture-batch-execution', () => {
  it('falls back to direct registry sync when docs exist and registry stays empty', () => {
    const repoRoot = fs.mkdtempSync(
      path.join(process.cwd(), 'tmp-capture-batch-fallback-'),
    );
    try {
      const docsRootDir = path.join(repoRoot, 'docs', 'simple-design-system');
      const docsDir = path.join(docsRootDir, 'components');
      const generatedDir = path.join(docsRootDir, '_generated');
      const proofsDir = path.join(generatedDir, 'visual-proofs');
      const renderDir = path.join(generatedDir, 'figma_doc_models');
      const specsDir = path.join(docsRootDir, '_spec', 'components');

      fs.mkdirSync(docsDir, { recursive: true });
      fs.mkdirSync(proofsDir, { recursive: true });
      fs.mkdirSync(renderDir, { recursive: true });
      fs.mkdirSync(specsDir, { recursive: true });

      fs.writeFileSync(
        path.join(docsDir, 'my_component.md'),
        [
          '---',
          'doc_type: component',
          'doc_status: draft',
          'figma:',
          '  file_url: https://www.figma.com/design/FILE123/Test?node-id=1-1',
          '  component: My Component',
          '  component_set_node_id: 1:1',
          '  last_verified: TBD',
          '---',
          '',
          '# My Component',
          '',
          'Generated during capture.',
          '',
        ].join('\n'),
        'utf8',
      );
      fs.writeFileSync(
        path.join(docsDir, 'overview.md'),
        ['---', 'doc_type: overview', 'doc_status: draft', '---', '', '# Components Overview', ''].join('\n'),
        'utf8',
      );

      fs.writeFileSync(
        path.join(generatedDir, 'component-registry.json'),
        JSON.stringify({ schema_version: 1, components: [], summary: {}, fingerprint_sha256: '' }, null, 2),
        'utf8',
      );

      const report = executeCaptureBatchAndRefresh({
        report: {
          ok: true,
          captured: [],
          failed: [],
        },
        targets: [],
        projectRoot: repoRoot,
        systemId: 'simple-design-system',
        runCaptureBatchFn: () => ({
          captured: [
            {
              slug: 'my_component',
              node_id: '1:1',
              markdown_path: 'docs/simple-design-system/components/my_component.md',
              proof_file_path: null,
              screenshot_url: null,
              local_image_path: null,
              variants_count: 0,
            },
          ],
          failed: [],
        }),
        runJsonCommandFn: () => ({ data: { ok: true } }),
        continueOnError: true,
        figmaToken: 'token',
        format: 'png',
        scale: 2,
        proofDir: proofsDir,
        proofImageDir: path.join(proofsDir, 'images'),
        includeVariants: true,
        variantLimit: 6,
        agent: 'auto',
        mainCaptureMode: 'rest',
        refreshIndices: true,
      });

      assert.equal(
        report.indices_refreshed,
        true,
        JSON.stringify(report.registry_refresh, null, 2),
      );
      assert.equal(
        (report.registry_refresh as { strategy?: string }).strategy,
        'direct-sync-fallback',
      );
      assert.equal(
        (report.registry_refresh as { fallback_reason?: string }).fallback_reason,
        'docs-present-registry-empty',
      );

      const registry = JSON.parse(
        fs.readFileSync(path.join(generatedDir, 'component-registry.json'), 'utf8'),
      ) as { components?: unknown[] };
      assert.ok(Array.isArray(registry.components));
      assert.ok((registry.components?.length || 0) > 0);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });
});
