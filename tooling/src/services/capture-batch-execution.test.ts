import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { executeCaptureBatchAndRefresh } from './capture-batch-execution.js';
import { PROJECT_ROOT } from '../utils/system-context.js';

describe('capture-batch-execution', () => {
  it('falls back to direct registry sync when docs exist and registry stays empty', () => {
    const tmpBaseDir = path.join(PROJECT_ROOT, 'tooling', '.tmp');
    fs.mkdirSync(tmpBaseDir, { recursive: true });
    const repoRoot = fs.mkdtempSync(
      path.join(tmpBaseDir, 'capture-batch-fallback-'),
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
        docsRootDir,
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

  it('keeps capture report successful when token usage index refresh throws', () => {
    const tmpBaseDir = path.join(PROJECT_ROOT, 'tooling', '.tmp');
    fs.mkdirSync(tmpBaseDir, { recursive: true });
    const repoRoot = fs.mkdtempSync(
      path.join(tmpBaseDir, 'capture-batch-token-usage-failure-'),
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
        docsRootDir,
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
        runJsonCommandFn: (_command, args) => {
          const scriptPath = String(args[0] || '');
          if (scriptPath.endsWith('ds-token-usage-index.mjs')) {
            throw new Error('usage index command failed');
          }
          return { data: { ok: true } };
        },
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

      assert.equal(report.ok, true);
      assert.equal(
        (report as { token_usage_refresh?: { ok?: boolean } }).token_usage_refresh?.ok,
        false,
      );
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('keeps capture report successful when token graph refresh throws', () => {
    const tmpBaseDir = path.join(PROJECT_ROOT, 'tooling', '.tmp');
    fs.mkdirSync(tmpBaseDir, { recursive: true });
    const repoRoot = fs.mkdtempSync(
      path.join(tmpBaseDir, 'capture-batch-token-graph-failure-'),
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
        docsRootDir,
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
        runJsonCommandFn: (_command, args) => {
          const scriptPath = String(args[0] || '');
          if (scriptPath.endsWith('ds-token-graph.mjs')) {
            throw new Error('token graph command failed');
          }
          return { data: { ok: true } };
        },
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

      assert.equal(report.ok, true);
      assert.equal(
        (report as { token_graph_refresh?: { ok?: boolean } }).token_graph_refresh?.ok,
        false,
      );
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('falls back to PROJECT_ROOT-relative proof image path when proof dir is non-standard', () => {
    const tmpBaseDir = path.join(PROJECT_ROOT, 'tooling', '.tmp');
    fs.mkdirSync(tmpBaseDir, { recursive: true });
    const repoRoot = fs.mkdtempSync(
      path.join(tmpBaseDir, 'capture-batch-proof-path-fallback-'),
    );
    try {
      const docsRootDir = path.join(repoRoot, 'docs', 'sample-system');
      const docsDir = path.join(docsRootDir, 'components');
      const generatedDir = path.join(docsRootDir, '_generated');
      const proofsDir = path.join(docsRootDir, 'nonstandard-proofs');
      const renderDir = path.join(generatedDir, 'figma_doc_models');
      const specsDir = path.join(docsRootDir, '_spec', 'components');
      const imageAbsPath = path.join(docsRootDir, '_generated', 'visual-proofs', 'images', 'sample.png');
      const imageRelToProject = path.relative(PROJECT_ROOT, imageAbsPath);

      fs.mkdirSync(docsDir, { recursive: true });
      fs.mkdirSync(proofsDir, { recursive: true });
      fs.mkdirSync(renderDir, { recursive: true });
      fs.mkdirSync(specsDir, { recursive: true });
      fs.mkdirSync(path.dirname(imageAbsPath), { recursive: true });
      fs.writeFileSync(imageAbsPath, 'fake-png', 'utf8');

      fs.writeFileSync(
        path.join(proofsDir, 'sample_component.json'),
        JSON.stringify(
          {
            node_id: '1:1',
            screenshot_url: 'https://example.com/screenshot.png',
            image_path: imageRelToProject,
          },
          null,
          2,
        ),
        'utf8',
      );
      fs.writeFileSync(
        path.join(specsDir, 'sample_component.yml'),
        ['name: sample_component', 'status: draft', 'summary:', '  purpose: x', '  when_to_use: y', '  when_not_to_use: z', 'anatomy: []', 'properties: []', 'content_guidelines:', '  rules: []', 'best_practices:', '  do: []', '  dont: []', 'accessibility:', '  role: button', 'token_mapping: {}', 'qa: []'].join('\n'),
        'utf8',
      );
      fs.writeFileSync(
        path.join(docsDir, 'sample_component.md'),
        ['---', 'doc_type: component', 'doc_status: draft', '---', '', '# Sample component', ''].join('\n'),
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
        systemId: 'sample-system',
        docsRootDir,
        runCaptureBatchFn: () => ({
          captured: [
            {
              slug: 'sample_component',
              node_id: '1:1',
              markdown_path: 'docs/sample-system/components/sample_component.md',
              proof_file_path: path.join(proofsDir, 'sample_component.json'),
              screenshot_url: 'https://example.com/screenshot.png',
              local_image_path: imageAbsPath,
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

      assert.equal(report.ok, true);
      const registry = JSON.parse(
        fs.readFileSync(path.join(generatedDir, 'component-registry.json'), 'utf8'),
      ) as { components?: Array<{ visual_proof?: { image_path?: string | null } }> };
      assert.equal(registry.components?.length, 1);
      assert.equal(
        registry.components?.[0]?.visual_proof?.image_path,
        imageRelToProject.split(path.sep).join('/'),
      );
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });
});
