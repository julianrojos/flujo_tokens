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
      }),
      runSpecRepairPromptFn: async () => ({
        message: `\`\`\`yaml\n${goldenSpecRaw}\n\`\`\``,
      }),
      validateGeneratedSpecFn: () => ({
        ok: true,
        report: { ok: true, summary: { errors: 0, warnings: 0 } },
        errors: [],
      }),
      syncDocumentationIndicesFn: () => ({
        changed: ['/mock/repo/docs/_generated/component-registry.json'],
        written: ['/mock/repo/docs/_generated/component-registry.json'],
        registry: {
          registryPath: '/mock/repo/docs/_generated/component-registry.json',
          fingerprint: 'abcd',
        },
        overview: {
          overviewPath: '/mock/repo/docs/overview.md',
        },
      }),
      runSpecWithGuardsFn: ({ run }: { run: ({ existingSpec }: { existingSpec: null }) => unknown }) =>
        run({ existingSpec: null }),
    });

    const report = await runSpecFromFigma(
      {
        url: 'https://www.figma.com/design/example-file/Components?node-id=100-200',
        'component-name': 'Example Button',
        system: 'system',
        force: 'true',
        'spec-root': '/mock/repo/docs/_spec/components',
        template: '/mock/repo/docs/_spec/components/_template.yml',
        registry: '/mock/repo/docs/_generated/token-registry.json',
      },
      mockDeps,
    );

    assert.equal(report.componentName, 'Example Button');
    assert.equal(report.componentSetNodeId, '100:200');
    assert.equal(
      writtenOutputPath,
      path.join('/mock/repo/docs/_spec/components/example_button.yml'),
    );
    assert.equal(writtenYamlContent, goldenSpecRaw, 'Spec does not match golden text');
  });
});
