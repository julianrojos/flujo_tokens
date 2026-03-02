/**
 * Render Agent Phase Tests
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert';

import { createRenderAgentPhase } from './render-agent-phase.js';
import { RenderArtifactManager } from './render-artifacts.js';
import type { ActiveMdToFigmaRuntimeContext } from '../types/active-md-to-figma.js';
import type { PipelineRenderState } from './render-pipeline-state.js';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'render-agent-test-'));
}

function removeDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function createMockContext(tempDir: string): ActiveMdToFigmaRuntimeContext {
  return {
    specPath: path.join(tempDir, 'spec.yml'),
    markdownPath: path.join(tempDir, 'doc.md'),
    tokenRegistryPath: path.join(tempDir, 'tokens.json'),
    generatedDir: path.join(tempDir, 'generated'),
    fileBase: 'test',
    componentName: 'Test',
    componentSlug: 'test',
    resolvedComponentSetId: '1:2',
    expectedThemeName: 'default',
    offsetX: 200,
    force: false,
    skipValidation: false,
    syncStatePath: path.join(tempDir, 'sync.json'),
    figmaUrl: undefined,
    system: undefined,
    scripts: {
      markdownToModelScript: path.join(tempDir, 'scripts/model.mjs'),
      modelToExecuteScript: path.join(tempDir, 'scripts/execute.mjs'),
    },
    themePath: path.join(tempDir, 'theme.yml'),
    systemPaths: {
      docsDir: path.join(tempDir, 'docs'),
      overviewPath: path.join(tempDir, 'docs/overview.md'),
      specsDir: path.join(tempDir, 'specs'),
      proofsDir: path.join(tempDir, 'proofs'),
      renderDir: path.join(tempDir, 'render'),
      registryPath: path.join(tempDir, 'registry.json'),
    },
    captureProofStrict: false,
  };
}

function createPipelineState(tempDir: string): PipelineRenderState {
  return {
    stage: 'pipeline',
    pipeline: {
      ok: true,
      paths: {
        docModelPath: path.join(tempDir, 'generated/test.doc-model.json'),
        executePath: path.join(tempDir, 'generated/test.figma-execute.js'),
        payloadPath: path.join(tempDir, 'generated/test.render-payload.json'),
      },
      skipped: false,
    },
  };
}

describe('render-agent-phase', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    removeDir(tempDir);
  });

  it('returns a named phase object', () => {
    const phase = createRenderAgentPhase({
      artifactManager: new RenderArtifactManager(tempDir, 'test'),
      agent: 'auto',
    });

    assert.strictEqual(phase.name, 'render-agent-phase');
    assert.strictEqual(typeof phase.execute, 'function');
  });

  it('fails if pipeline state is missing', async () => {
    const phase = createRenderAgentPhase({
      artifactManager: new RenderArtifactManager(tempDir, 'test'),
      agent: 'auto',
    });

    const result = await phase.execute(createMockContext(tempDir), { stage: 'initial' });
    assert.strictEqual(result.ok, false);
    assert.match(result.error || '', /requires pipeline/i);
  });

  it('fails if render expectations cannot be read from payload', async () => {
    const phase = createRenderAgentPhase({
      artifactManager: new RenderArtifactManager(tempDir, 'test'),
      agent: 'auto',
    });

    const result = await phase.execute(createMockContext(tempDir), createPipelineState(tempDir));
    assert.strictEqual(result.ok, false);
    assert.match(result.error || '', /render expectations|render payload/i);
  });
});
