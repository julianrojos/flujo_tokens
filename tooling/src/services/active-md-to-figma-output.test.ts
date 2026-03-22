/**
 * Active Markdown to Figma Output Tests
 *
 * Unit tests for CLI output formatting.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { formatPipelineSkipOutput } from './active-md-to-figma-output.js';

describe('active-md-to-figma-output', () => {
  describe('formatPipelineSkipOutput', () => {
    it('should format skip output with reason', () => {
      const output = formatPipelineSkipOutput(
        'fingerprint_match',
        '/test/doc.md',
        'TestComponent',
        {
          docModelPath: '/test/doc-model.json',
          executePath: '/test/execute.js',
          payloadPath: '/test/payload.json',
        },
      );

      assert.ok(output.includes('fingerprint_match'));
    });

    it('should include markdownPath in output', () => {
      const output = formatPipelineSkipOutput(
        'cache_hit',
        '/test/docs/my-component.md',
        'MyComponent',
        {
          docModelPath: '/test/doc-model.json',
          executePath: '/test/execute.js',
          payloadPath: '/test/payload.json',
        },
      );

      const parsed = JSON.parse(output);
      assert.strictEqual(parsed.markdownPath, '/test/docs/my-component.md');
    });

    it('should include componentName in output', () => {
      const output = formatPipelineSkipOutput(
        'cache_hit',
        '/test/doc.md',
        'TestButton',
        {
          docModelPath: '/test/doc-model.json',
          executePath: '/test/execute.js',
          payloadPath: '/test/payload.json',
        },
      );

      const parsed = JSON.parse(output);
      assert.strictEqual(parsed.componentName, 'TestButton');
    });

    it('should include outputs (paths) in output', () => {
      const paths = {
        docModelPath: '/test/generated/test.doc-model.json',
        executePath: '/test/generated/test.figma-execute.js',
        payloadPath: '/test/generated/test.render-payload.json',
      };

      const output = formatPipelineSkipOutput(
        'cache_hit',
        '/test/doc.md',
        'Test',
        paths,
      );

      const parsed = JSON.parse(output);
      assert.deepStrictEqual(parsed.outputs, paths);
    });

    it('should include hint in output', () => {
      const output = formatPipelineSkipOutput(
        'cache_hit',
        '/test/doc.md',
        'Test',
        {
          docModelPath: '/test/doc-model.json',
          executePath: '/test/execute.js',
          payloadPath: '/test/payload.json',
        },
      );

      const parsed = JSON.parse(output);
      assert.strictEqual(
        parsed.hint,
        'Use --force true to regenerate and re-render in Figma.',
      );
    });

    it('should return valid JSON with newline', () => {
      const output = formatPipelineSkipOutput(
        'cache_hit',
        '/test/doc.md',
        'Test',
        {
          docModelPath: '/test/doc-model.json',
          executePath: '/test/execute.js',
          payloadPath: '/test/payload.json',
        },
      );

      // Should be valid JSON
      const parsed = JSON.parse(output.trim());
      assert.ok(parsed);

      // Should end with newline
      assert.ok(output.endsWith('\n'));
    });

    it('should have correct structure with all required fields', () => {
      const output = formatPipelineSkipOutput(
        'fingerprint_match',
        '/test/doc.md',
        'TestComponent',
        {
          docModelPath: '/test/doc-model.json',
          executePath: '/test/execute.js',
          payloadPath: '/test/payload.json',
        },
      );

      const parsed = JSON.parse(output.trim());

      assert.ok('ok' in parsed);
      assert.ok('skipped' in parsed);
      assert.ok('reason' in parsed);
      assert.ok('markdownPath' in parsed);
      assert.ok('componentName' in parsed);
      assert.ok('outputs' in parsed);
      assert.ok('hint' in parsed);

      assert.strictEqual(parsed.ok, true);
      assert.strictEqual(parsed.skipped, true);
    });
  });
});
