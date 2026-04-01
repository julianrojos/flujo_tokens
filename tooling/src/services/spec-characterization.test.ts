/**
 * Spec Characterization Tests
 *
 * Characterizes the spec generation pipeline against the golden YAML sample.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { runSpecFromFigma } from './spec-orchestrator.js';
import { parseYamlDocument } from '../utils/parse-frontmatter.js';
import { createCaptureContextMock } from '../utils/mock-factories.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN_SPEC_PATH = path.join(__dirname, '../../scripts/lib/golden-samples/component-spec.yml');

describe('spec-characterization', () => {
  it('exactly matches golden YAML', async () => {
    const goldenSpecRaw = await fs.readFile(GOLDEN_SPEC_PATH, 'utf-8');

    let writtenOutputPath: string | null = null;
    let writtenYamlContent: string | null = null;

    const mockDeps = createCaptureContextMock({
      loadTokenRegistryFn: () => ({
        tokens: {
          'Components/Button/Background/Primary/Default': { value: '#1C6B4A' },
        },
      }),
      loadRegistryOrThrowFn: () => ({
        token_a: {
          path: 'components.alert.icon.color',
          slashPath: 'components/alert/icon/color',
          collection: 'components',
          type: 'color',
          resolvedValue: '#FF0000',
        },
      }),
      ensureSpecTemplateExistsFn: () => {},
      ensureSpecOutputDirectoryFn: () => {},
      materializeSpecFn: () => {
        writtenYamlContent = goldenSpecRaw;
        return {
          normalizedSpec: parseYamlDocument(goldenSpecRaw, 'golden spec'),
          prefilledCount: 0,
        };
      },
      writeSpecWithSnapshotGuardFn: ({ outputPath }: { outputPath: string }) => {
        writtenOutputPath = outputPath;
      },
      assertEvidenceGatedScalarChangesFn: () => {},
      runSpecGenerationPromptFn: async () => ({
        message: `Here is your spec:\n\`\`\`yaml\n${goldenSpecRaw}\n\`\`\``,
      }) as any,
      runSpecRepairPromptFn: async () => ({
        message: `\`\`\`yaml\n${goldenSpecRaw}\n\`\`\``,
      }) as any,
      validateGeneratedSpecFn: () => ({
        ok: true,
        report: { ok: true, summary: { errors: 0, warnings: 0 } },
        errors: [],
      }) as any,
      syncDocumentationIndicesFn: () => ({
        changed: ['/mock/repo/apps/ds-dashboard/server/db/ds-dashboard.db'],
        written: ['/mock/repo/apps/ds-dashboard/server/db/ds-dashboard.db'],
        registry: {
          registryDbPath: '/mock/repo/apps/ds-dashboard/server/db/ds-dashboard.db',
          fingerprint: 'abcd',
        },
        overview: {
          overviewPath: '/mock/repo/docs/overview.md',
        },
      }) as any,
      runSpecWithGuardsFn: ({ run }: { run: ({ existingSpec }: { existingSpec: null }) => unknown }) =>
        run({ existingSpec: null }),
    });

    const report = await runSpecFromFigma(
      {
        url: 'https://www.figma.com/design/example-file/Components?node-id=100-200',
        'component-name': 'Example Button',
        system: 'system',
        force: 'true',
        'spec-root': '/mock/repo/design-systems/sys-01/docs/_spec/components',
        template: '/mock/repo/design-systems/sys-01/docs/_spec/components/_template.yml',
        registry: '/mock/repo/docs/_generated/token-registry.json',
      },
      mockDeps,
    );

    assert.equal(report.componentName, 'Example Button');
    assert.equal(report.componentSetNodeId, '100:200');
    assert.equal(
      writtenOutputPath,
      path.join('/mock/repo/design-systems/sys-01/docs/_spec/components/example_button.yml'),
    );
    assert.equal(writtenYamlContent, goldenSpecRaw, 'Spec does not match golden text');
  });
});
