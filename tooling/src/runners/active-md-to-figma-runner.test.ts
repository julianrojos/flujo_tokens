import { describe, it } from 'node:test';
import assert from 'node:assert';

import { runActiveMdToFigma } from './active-md-to-figma-runner.js';
import type { ActiveMdToFigmaPreparationResult } from '../services/active-md-to-figma-preparation.js';
import type { ActiveMdToFigmaRuntime } from '../services/active-md-to-figma-runtime.js';
import type { PipelineRenderState } from '../services/render-pipeline-state.js';

function createPreflight(): ActiveMdToFigmaPreparationResult {
  return {
    markdownPath: '/docs/button.md',
    specPath: '/specs/button.yml',
    tokenRegistryPath: '/registry.json',
    syncStatePath: '/state.json',
    generatedDir: '/generated',
    fileBase: 'button',
    componentName: 'Button',
    componentSlug: 'button',
    resolvedComponentSetId: '1:2',
    specStatus: 'ready',
    force: false,
    skipValidation: false,
    captureProofStrict: false,
    offsetX: 200,
    figmaUrl: 'https://figma.com/file/abc',
    agent: 'auto',
    expectedThemeName: 'default',
    ctx: {
      id: 'test',
      name: 'Test System',
      docsDir: '/docs',
      paths: {
        input: '/input',
        output: '/output',
        docs: '/docs',
        specs: '/specs',
        generated: '/generated',
        registry: '/registry.json',
        tokenRegistry: '/registry.json',
      },
    } as ActiveMdToFigmaPreparationResult['ctx'],
  };
}

function createRuntime(): ActiveMdToFigmaRuntime {
  return {
    context: {
      specPath: '/specs/button.yml',
      markdownPath: '/docs/button.md',
      tokenRegistryPath: '/registry.json',
      generatedDir: '/generated',
      fileBase: 'button',
      componentName: 'Button',
      componentSlug: 'button',
      resolvedComponentSetId: '1:2',
      expectedThemeName: 'default',
      offsetX: 200,
      force: false,
      skipValidation: false,
      scripts: {
        markdownToModelScript: '/scripts/a.mjs',
        modelToExecuteScript: '/scripts/b.mjs',
      },
      themePath: '/theme.yml',
      systemPaths: {
        docsDir: '/docs',
        overviewPath: '/docs/overview.md',
        specsDir: '/specs',
        proofsDir: '/proofs',
        renderDir: '/generated',
        registryPath: '/registry.json',
      },
      syncStatePath: '/state.json',
      figmaUrl: 'https://figma.com/file/abc',
      system: 'test',
      captureProofStrict: false,
    },
    phases: [],
  };
}

function createSkippedPipelineState(): PipelineRenderState {
  return {
    stage: 'pipeline',
    pipeline: {
      ok: true,
      skipped: true,
      skipReason: 'cache hit',
      paths: {
        docModelPath: '/generated/button.doc-model.json',
        executePath: '/generated/button.execute.js',
        payloadPath: '/generated/button.payload.json',
      },
    },
  };
}

function createSuccessPipelineState(): PipelineRenderState {
  return {
    stage: 'pipeline',
    pipeline: {
      ok: true,
      skipped: false,
      paths: {
        docModelPath: '/generated/button.doc-model.json',
        executePath: '/generated/button.execute.js',
        payloadPath: '/generated/button.payload.json',
      },
    },
  };
}

describe('active-md-to-figma-runner', () => {
  it('uses active-md-to-figma-output when pipeline is skipped', async () => {
    const preflight = createPreflight();
    const runtime = createRuntime();
    const calls = {
      formatSkipOutput: 0,
      syncDocs: 0,
      writeStdout: [] as string[],
    };

    await runActiveMdToFigma({}, {
      executePreparation: () => preflight,
      buildRuntime: () => runtime,
      runPhases: async () => createSkippedPipelineState(),
      formatSkipOutput: (reason, markdownPath, componentName) => {
        calls.formatSkipOutput += 1;
        return `${reason}:${markdownPath}:${componentName}\n`;
      },
      syncDocs: () => {
        calls.syncDocs += 1;
        return { ok: true };
      },
      writeStdout: (text) => {
        calls.writeStdout.push(text);
      },
    });

    assert.strictEqual(calls.formatSkipOutput, 1);
    assert.strictEqual(calls.syncDocs, 0);
    assert.deepStrictEqual(calls.writeStdout, ['cache hit:/docs/button.md:Button\n']);
  });

  it('calls documentation-sync when pipeline succeeds', async () => {
    const preflight = createPreflight();
    const runtime = createRuntime();
    const calls = {
      syncDocs: 0,
      syncedContext: null as ActiveMdToFigmaRuntime['context'] | null,
    };

    await runActiveMdToFigma({}, {
      executePreparation: () => preflight,
      buildRuntime: () => runtime,
      runPhases: async () => createSuccessPipelineState(),
      formatSkipOutput: () => {
        throw new Error('should not format skip output on success');
      },
      syncDocs: (context) => {
        calls.syncDocs += 1;
        calls.syncedContext = context;
        return { ok: true };
      },
      writeStdout: () => {
        throw new Error('should not write stdout on success');
      },
    });

    assert.strictEqual(calls.syncDocs, 1);
    assert.strictEqual(calls.syncedContext, runtime.context);
  });

  it('propagates phase execution errors', async () => {
    const preflight = createPreflight();
    const runtime = createRuntime();

    await assert.rejects(
      async () => runActiveMdToFigma({}, {
        executePreparation: () => preflight,
        buildRuntime: () => runtime,
        runPhases: async () => {
          throw new Error('phase exploded');
        },
        formatSkipOutput: () => 'unused\n',
        syncDocs: () => ({ ok: true }),
        writeStdout: () => undefined,
      }),
      /phase exploded/,
    );
  });
});
