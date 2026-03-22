/**
 * Active Markdown to Figma Types Tests
 *
 * Unit tests for active-md-to-figma types and context builder.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  type ActiveMdToFigmaRuntimeContext,
  type BuildActiveMdToFigmaRuntimeContextOptions,
} from './active-md-to-figma.js';
import { buildActiveMdToFigmaRuntimeContext } from '../utils/active-md-to-figma-context.js';

/**
 * Create mock builder options for testing.
 */
function createMockOptions(
  overrides?: Partial<BuildActiveMdToFigmaRuntimeContextOptions>,
): BuildActiveMdToFigmaRuntimeContextOptions {
  return {
    specPath: '/test/specs/test-component.yml',
    markdownPath: '/test/docs/test-component.md',
    tokenRegistryPath: '/test/tokens/registry.json',
    generatedDir: '/test/generated/figma_doc_models',
    fileBase: 'test-component',
    componentName: 'TestComponent',
    componentSlug: 'test_component',
    resolvedComponentSetId: '123:456',
    expectedThemeName: 'default',
    offsetX: 200,
    force: false,
    skipValidation: false,
    scripts: {
      markdownToModelScript: '/test/scripts/markdown_to_doc_model.mjs',
      modelToExecuteScript: '/test/scripts/build_figma_execute_code.mjs',
    },
    themePath: '/test/theme.yml',
    systemPaths: {
      docsDir: '/test/docs',
      overviewPath: '/test/docs/overview.md',
      specsDir: '/test/specs',
      proofsDir: '/test/proofs',
      renderDir: '/test/generated/figma_doc_models',
      registryPath: '/test/registry.json',
    },
    captureProofStrict: false,
    ...overrides,
  };
}

describe('active-md-to-figma types', () => {
  describe('buildActiveMdToFigmaRuntimeContext', () => {
    it('should build context with all required fields', () => {
      const options = createMockOptions();
      const context = buildActiveMdToFigmaRuntimeContext(options);

      assert.strictEqual(context.specPath, options.specPath);
      assert.strictEqual(context.markdownPath, options.markdownPath);
      assert.strictEqual(context.tokenRegistryPath, options.tokenRegistryPath);
      assert.strictEqual(context.generatedDir, options.generatedDir);
      assert.strictEqual(context.fileBase, options.fileBase);
      assert.strictEqual(context.componentName, options.componentName);
      assert.strictEqual(context.componentSlug, options.componentSlug);
      assert.strictEqual(context.resolvedComponentSetId, options.resolvedComponentSetId);
      assert.strictEqual(context.expectedThemeName, options.expectedThemeName);
      assert.strictEqual(context.offsetX, options.offsetX);
      assert.strictEqual(context.force, options.force);
      assert.strictEqual(context.skipValidation, options.skipValidation);
    });

    it('should handle optional fields when provided', () => {
      const options = createMockOptions({
        syncStatePath: '/test/sync-state.json',
        figmaUrl: 'https://figma.com/file/abc123',
        system: 'test-system',
      });
      const context = buildActiveMdToFigmaRuntimeContext(options);

      assert.strictEqual(context.syncStatePath, '/test/sync-state.json');
      assert.strictEqual(context.figmaUrl, 'https://figma.com/file/abc123');
      assert.strictEqual(context.system, 'test-system');
    });

    it('should handle undefined optional fields', () => {
      const options = createMockOptions({
        syncStatePath: undefined,
        figmaUrl: undefined,
        system: undefined,
      });
      const context = buildActiveMdToFigmaRuntimeContext(options);

      assert.strictEqual(context.syncStatePath, undefined);
      assert.strictEqual(context.figmaUrl, undefined);
      assert.strictEqual(context.system, undefined);
    });

    it('should omit optional fields when not provided', () => {
      const options = createMockOptions();
      const context = buildActiveMdToFigmaRuntimeContext(options);

      assert.strictEqual(context.syncStatePath, undefined);
      assert.strictEqual(context.figmaUrl, undefined);
      assert.strictEqual(context.system, undefined);
    });

    it('should support different component configurations', () => {
      const options = createMockOptions({
        fileBase: 'custom-button',
        componentName: 'CustomButton',
        componentSlug: 'custom_button',
      });
      const context = buildActiveMdToFigmaRuntimeContext(options);

      assert.strictEqual(context.fileBase, 'custom-button');
      assert.strictEqual(context.componentName, 'CustomButton');
      assert.strictEqual(context.componentSlug, 'custom_button');
    });

    it('should support different offset values', () => {
      const options1 = createMockOptions({ offsetX: 100 });
      const options2 = createMockOptions({ offsetX: 500 });

      const context1 = buildActiveMdToFigmaRuntimeContext(options1);
      const context2 = buildActiveMdToFigmaRuntimeContext(options2);

      assert.strictEqual(context1.offsetX, 100);
      assert.strictEqual(context2.offsetX, 500);
    });

    it('should support force flag override', () => {
      const options = createMockOptions({ force: true });
      const context = buildActiveMdToFigmaRuntimeContext(options);

      assert.strictEqual(context.force, true);
    });

    it('should support skipValidation flag', () => {
      const options = createMockOptions({ skipValidation: true });
      const context = buildActiveMdToFigmaRuntimeContext(options);

      assert.strictEqual(context.skipValidation, true);
    });
  });

  describe('ActiveMdToFigmaRuntimeContext type', () => {
    it('should accept valid context structure', () => {
      const context: ActiveMdToFigmaRuntimeContext = {
        specPath: '/test/spec.yml',
        markdownPath: '/test/doc.md',
        tokenRegistryPath: '/test/tokens.json',
        generatedDir: '/test/generated',
        fileBase: 'test',
        componentName: 'Test',
        componentSlug: 'test',
        resolvedComponentSetId: '1:2',
        expectedThemeName: 'default',
        offsetX: 200,
        force: false,
        skipValidation: false,
        scripts: {
          markdownToModelScript: '/test/scripts/model.mjs',
          modelToExecuteScript: '/test/scripts/execute.mjs',
        },
        themePath: '/test/theme.yml',
        systemPaths: {
          docsDir: '/test/docs',
          overviewPath: '/test/docs/overview.md',
          specsDir: '/test/specs',
          proofsDir: '/test/proofs',
          renderDir: '/test/render',
          registryPath: '/test/registry.json',
        },
        captureProofStrict: false,
      };

      assert.strictEqual(context.fileBase, 'test');
      assert.strictEqual(context.offsetX, 200);
    });

    it('should accept context with optional fields', () => {
      const context: ActiveMdToFigmaRuntimeContext = {
        specPath: '/test/spec.yml',
        markdownPath: '/test/doc.md',
        tokenRegistryPath: '/test/tokens.json',
        generatedDir: '/test/generated',
        fileBase: 'test',
        componentName: 'Test',
        componentSlug: 'test',
        resolvedComponentSetId: '1:2',
        expectedThemeName: 'default',
        offsetX: 200,
        force: false,
        skipValidation: false,
        syncStatePath: '/test/sync.json',
        figmaUrl: 'https://figma.com/file/abc',
        system: 'iter',
        scripts: {
          markdownToModelScript: '/test/scripts/model.mjs',
          modelToExecuteScript: '/test/scripts/execute.mjs',
        },
        themePath: '/test/theme.yml',
        systemPaths: {
          docsDir: '/test/docs',
          overviewPath: '/test/docs/overview.md',
          specsDir: '/test/specs',
          proofsDir: '/test/proofs',
          renderDir: '/test/render',
          registryPath: '/test/registry.json',
        },
        captureProofStrict: false,
      };

      assert.strictEqual(context.syncStatePath, '/test/sync.json');
      assert.strictEqual(context.figmaUrl, 'https://figma.com/file/abc');
      assert.strictEqual(context.system, 'iter');
    });
  });

  describe('BuildActiveMdToFigmaRuntimeContextOptions type', () => {
    it('should accept valid options structure', () => {
      const options: BuildActiveMdToFigmaRuntimeContextOptions = {
        specPath: '/test/spec.yml',
        markdownPath: '/test/doc.md',
        tokenRegistryPath: '/test/tokens.json',
        generatedDir: '/test/generated',
        fileBase: 'test',
        componentName: 'Test',
        componentSlug: 'test',
        resolvedComponentSetId: '1:2',
        expectedThemeName: 'default',
        offsetX: 200,
        force: false,
        skipValidation: false,
        scripts: {
          markdownToModelScript: '/test/scripts/model.mjs',
          modelToExecuteScript: '/test/scripts/execute.mjs',
        },
        themePath: '/test/theme.yml',
        systemPaths: {
          docsDir: '/test/docs',
          overviewPath: '/test/docs/overview.md',
          specsDir: '/test/specs',
          proofsDir: '/test/proofs',
          renderDir: '/test/render',
          registryPath: '/test/registry.json',
        },
        captureProofStrict: false,
      };

      assert.strictEqual(options.fileBase, 'test');
      assert.strictEqual(options.offsetX, 200);
    });

    it('should accept options with optional fields', () => {
      const options: BuildActiveMdToFigmaRuntimeContextOptions = {
        specPath: '/test/spec.yml',
        markdownPath: '/test/doc.md',
        tokenRegistryPath: '/test/tokens.json',
        generatedDir: '/test/generated',
        fileBase: 'test',
        componentName: 'Test',
        componentSlug: 'test',
        resolvedComponentSetId: '1:2',
        expectedThemeName: 'default',
        offsetX: 200,
        force: false,
        skipValidation: false,
        syncStatePath: '/test/sync.json',
        figmaUrl: 'https://figma.com/file/abc',
        system: 'iter',
        scripts: {
          markdownToModelScript: '/test/scripts/model.mjs',
          modelToExecuteScript: '/test/scripts/execute.mjs',
        },
        themePath: '/test/theme.yml',
        systemPaths: {
          docsDir: '/test/docs',
          overviewPath: '/test/docs/overview.md',
          specsDir: '/test/specs',
          proofsDir: '/test/proofs',
          renderDir: '/test/render',
          registryPath: '/test/registry.json',
        },
        captureProofStrict: false,
      };

      assert.strictEqual(options.syncStatePath, '/test/sync.json');
      assert.strictEqual(options.figmaUrl, 'https://figma.com/file/abc');
      assert.strictEqual(options.system, 'iter');
    });
  });

  describe('builder integration', () => {
    it('should produce consistent context from same options', () => {
      const options = createMockOptions();
      const context1 = buildActiveMdToFigmaRuntimeContext(options);
      const context2 = buildActiveMdToFigmaRuntimeContext(options);

      assert.deepStrictEqual(context1, context2);
    });

    it('should produce different context from different options', () => {
      const options1 = createMockOptions({ fileBase: 'component-a' });
      const options2 = createMockOptions({ fileBase: 'component-b' });

      const context1 = buildActiveMdToFigmaRuntimeContext(options1);
      const context2 = buildActiveMdToFigmaRuntimeContext(options2);

      assert.notStrictEqual(context1.fileBase, context2.fileBase);
    });

    it('should preserve all field values through build', () => {
      const options = createMockOptions({
        syncStatePath: '/test/sync.json',
        figmaUrl: 'https://figma.com/file/test',
        system: 'production',
      });
      const context = buildActiveMdToFigmaRuntimeContext(options);

      // Verify all fields are preserved
      for (const key of Object.keys(options) as Array<keyof BuildActiveMdToFigmaRuntimeContextOptions>) {
        assert.strictEqual(context[key], options[key], `Field ${key} should match`);
      }
    });
  });
});
