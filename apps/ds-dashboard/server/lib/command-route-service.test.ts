/**
 * Command Route Service Tests
 *
 * Tests for command configuration builders.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildCaptureFigmaScreenshotCommandConfig,
  buildHealthSnapshotCommandConfig,
  buildRunScriptCommandArgs,
  buildSyncFigmaTokensCommandConfig,
} from './command-route-service.js';

describe('command-route-service', () => {
  describe('buildRunScriptCommandArgs()', () => {
    it('adds pipeline options', () => {
      const payload = buildRunScriptCommandArgs({
        scriptName: 'ds:pipeline',
        systemId: 'core',
        body: {
          all: true,
          component: 'button',
          fromStep: 'markdown',
          onlyStep: 'markdown',
          dryRun: true,
        },
      });
      assert.deepEqual(payload.args, [
        'run',
        'ds:pipeline',
        '--',
        '--system',
        'core',
        '--all',
        '--component',
        'button',
        '--from-step',
        'markdown',
        '--only-step',
        'markdown',
        '--status-only',
      ]);
    });

    it('adds component-name for ds:component-doc', () => {
      const payload = buildRunScriptCommandArgs({
        scriptName: 'ds:component-doc',
        systemId: 'core',
        body: {
          component: 'button',
        },
      });
      assert.deepEqual(payload.args, [
        'run',
        'ds:component-doc',
        '--',
        '--system',
        'core',
        '--component-name',
        'button',
      ]);
    });

    it('prefers spec-file for ds:component-doc', () => {
      const payload = buildRunScriptCommandArgs({
        scriptName: 'ds:component-doc',
        systemId: 'core',
        body: {
          component: 'button',
          specFile: 'docs/caca-01/_spec/components/button.yml',
        },
      });
      assert.deepEqual(payload.args, [
        'run',
        'ds:component-doc',
        '--',
        '--system',
        'core',
        '--spec-file',
        'docs/caca-01/_spec/components/button.yml',
      ]);
    });

    it('accepts legacy aliases for ds:component-doc', () => {
      const payload = buildRunScriptCommandArgs({
        scriptName: 'ds:component-doc',
        systemId: 'core',
        body: {
          componentName: 'button',
          spec_file: 'docs/caca-01/_spec/components/button.yml',
        },
      });
      assert.deepEqual(payload.args, [
        'run',
        'ds:component-doc',
        '--',
        '--system',
        'core',
        '--spec-file',
        'docs/caca-01/_spec/components/button.yml',
      ]);
    });
  });

  describe('buildHealthSnapshotCommandConfig()', () => {
    it('validates git ref', () => {
      const invalid = buildHealthSnapshotCommandConfig({
        body: { beforeRef: '???' },
        validateGitRef: () => null,
        toBooleanString: () => 'false',
      });
      assert.equal(invalid.ok, false);
      assert.equal((invalid as any).errorArgs.code, 'validation.invalid_git_ref');

      const valid = buildHealthSnapshotCommandConfig({
        body: { beforeRef: 'HEAD~2', retentionDays: 30, skipDiff: true },
        validateGitRef: (value: string) => value,
        toBooleanString: (value: unknown) => (value ? 'true' : 'false'),
      });
      assert.equal(valid.ok, true);
      assert.ok((valid as any).commandLabel.includes('--before-ref HEAD~2'));
    });
  });

  describe('buildSyncFigmaTokensCommandConfig()', () => {
    it('moves figma token to command env', () => {
      const payload = buildSyncFigmaTokensCommandConfig({
        body: {
          figmaUrl: 'https://www.figma.com/file/abc/xyz',
          figmaToken: 'secret',
          dryRun: false,
        },
        toBooleanString: (value: unknown, fallback: boolean) =>
          value === undefined ? (fallback ? 'true' : 'false') : String(!!value),
      });
      assert.ok(!payload.commandArgs.includes('secret'));
      assert.deepEqual(payload.commandEnv, { FIGMA_TOKEN: 'secret' });
    });
  });

  describe('buildCaptureFigmaScreenshotCommandConfig()', () => {
    it('validates url and host', () => {
      const missing = buildCaptureFigmaScreenshotCommandConfig({
        body: {},
        toBooleanString: () => 'false',
        toNumberString: () => '1',
      });
      assert.equal(missing.ok, false);
      assert.equal((missing as any).errorArgs.code, 'validation.figma_url_required');

      const invalidHost = buildCaptureFigmaScreenshotCommandConfig({
        body: { figmaUrl: 'https://example.com/file/abc' },
        toBooleanString: () => 'false',
        toNumberString: () => '1',
      });
      assert.equal(invalidHost.ok, false);
      assert.equal((invalidHost as any).errorArgs.code, 'validation.invalid_figma_host');

      const valid = buildCaptureFigmaScreenshotCommandConfig({
        body: {
          figmaUrl: 'https://www.figma.com/file/abc',
          figmaToken: 'secret',
          componentSlug: 'Button',
        },
        toBooleanString: (value: unknown, fallback: boolean) =>
          value === undefined ? (fallback ? 'true' : 'false') : String(!!value),
        toNumberString: (value: unknown, fallback: number) => String(value ?? fallback),
      });
      assert.equal(valid.ok, true);
      assert.ok((valid as any).commandArgs.includes('--url'));
      assert.ok(!(valid as any).commandArgs.includes('secret'));
      assert.deepEqual((valid as any).commandEnv, { FIGMA_TOKEN: 'secret' });
    });
  });
});
