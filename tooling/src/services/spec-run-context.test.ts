/**
 * Spec Run Context Tests
 *
 * Tests for createSpecRunContext function.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createSpecRunContext } from './spec-run-context.js';

describe('spec-run-context', () => {
  describe('createSpecRunContext()', () => {
    it('creates normalized context from args and system context', () => {
      const result = createSpecRunContext({
        args: {
          url: 'https://www.figma.com/design/FILE123/Components?node-id=123-456',
          'component-name': 'Alert',
          'spec-root': '/tmp/specs',
        },
        context: {
          figmaUrl: 'https://www.figma.com/design/FILE123/Components?node-id=123-456',
          system: {
            paths: {
              specs: '/tmp/specs',
            },
          },
          paths: {
            resolvedSpecRoot: '/tmp/specs',
            docsRootDir: '/tmp/docs',
            templatePath: '/tmp/specs/_template.yml',
            tokenRegistryPath: '/tmp/docs/_generated/token-registry.json',
            overviewPath: '/tmp/docs/overview.md',
            registryIndexPath: '/tmp/docs/_generated/component-registry.json',
          },
          flags: {
            force: true,
            skipValidation: false,
            allowNonEvidenceUpdates: false,
            agent: 'auto',
          },
        } as any,
      });

      assert.equal(result.componentName, 'Alert');
      assert.equal(result.fileKeyFromUrl, 'FILE123');
      assert.equal(result.nodeId, '123:456');
      assert.equal(result.outputPath, '/tmp/specs/alert.yml');
      assert.equal(result.registryPath, '/tmp/docs/_generated/token-registry.json');
      assert.equal(result.allowedWritePaths.length, 3);
    });

    it('throws when no source is provided', () => {
      assert.throws(() =>
        createSpecRunContext({
          args: {
            'component-name': '',
          },
          context: {
            figmaUrl: '',
            system: {
              paths: {
                specs: '/tmp/specs',
              },
            },
            paths: {
              resolvedSpecRoot: '/tmp/specs',
              docsRootDir: '/tmp/docs',
              templatePath: '/tmp/specs/_template.yml',
              tokenRegistryPath: '/tmp/docs/_generated/token-registry.json',
              overviewPath: '/tmp/docs/overview.md',
              registryIndexPath: '/tmp/docs/_generated/component-registry.json',
            },
            flags: {
              force: false,
              skipValidation: false,
              allowNonEvidenceUpdates: false,
              agent: 'auto',
            },
          } as any,
        }),
      );
    });
  });
});
