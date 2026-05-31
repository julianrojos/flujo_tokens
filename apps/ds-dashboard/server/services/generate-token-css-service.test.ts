import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { Sql } from 'postgres';

import { flushCssToDisk, generateTokenCssFromDb } from './generate-token-css-service.ts';

function createMockDb(): Sql {
  return (async (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => {
    const query = String.raw({ raw: strings }, ...values);
    if (query.includes('FROM tokens t')) {
      return [
        {
          id: 'color.primary',
          css_var: '--color-primary',
          collection: 'Primitives',
          type: 'color',
          raw_value: '#ff0000',
        },
        {
          id: 'color.secondary',
          css_var: '--color-secondary',
          collection: 'Tokens',
          type: 'color',
          raw_value: '#00ff00',
        },
      ];
    }
    if (query.includes('FROM token_mode_values tmv')) {
      return [
        {
          token_path: 'color.primary',
          mode: 'Default',
          resolved_value: '#00ff00',
        },
      ];
    }
    throw new Error(`Unexpected query: ${query}`);
  }) as unknown as Sql;
}

/** Mock DB with an alias token whose resolved_value is a dot-path (Figma format). */
function createMockDbWithAlias(): Sql {
  return (async (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => {
    const query = String.raw({ raw: strings }, ...values);
    if (query.includes('FROM tokens t')) {
      return [
        {
          id: 'Color.Grey.100',
          css_var: '--color-grey-100',
          collection: 'Primitives',
          type: 'color',
          raw_value: '#ECECEC',
        },
        {
          id: 'Bottom-Bar.Background-Default',
          css_var: '--bottom-bar-background-default',
          collection: 'Components',
          type: 'color',
          raw_value: 'Color.Grey.100',
        },
      ];
    }
    if (query.includes('FROM token_mode_values tmv')) {
      return [
        {
          token_path: 'Color.Grey.100',
          mode: 'Default',
          resolved_value: '#ECECEC',
        },
        {
          // Alias: resolved_value is the dot-path of the target token, as
          // stored by toResolvedValue() when it encounters a VARIABLE_ALIAS.
          token_path: 'Bottom-Bar.Background-Default',
          mode: 'Default',
          resolved_value: 'Color.Grey.100',
        },
      ];
    }
    throw new Error(`Unexpected query: ${query}`);
  }) as unknown as Sql;
}

describe('generate-token-css-service', () => {
  it('returns split css contents and token catalog entries from db state', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-token-css-'));
    const db = createMockDb();

    const result = await generateTokenCssFromDb({
      db,
      dsId: 'sys-01',
      repoRoot: tmpRoot,
    });

    assert.equal(result.primitivesCount, 1);
    assert.equal(result.tokensCount, 1);
    assert.match(result.primitivesCss, /--color-primary:\s+#00ff00;/);
    assert.match(result.tokensCss, /--color-secondary:\s+#00ff00;/);
    assert.equal(result.tokenCatalog.entries.length, 2);
    assert.equal(result.tokenCatalog.entries[0]?.type, 'color');
    assert.equal(result.tokenCatalog.entries[0]?.cssVar, '--color-primary');
    assert.equal(fs.existsSync(result.primitivesPath), true);
    assert.equal(fs.existsSync(result.tokensPath), true);
  });

  it('does not write css files when skipDiskWrite is true', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-token-css-skip-'));
    const db = createMockDb();

    const result = await generateTokenCssFromDb({
      db,
      dsId: 'sys-01',
      repoRoot: tmpRoot,
      skipDiskWrite: true,
    });

    assert.equal(fs.existsSync(result.primitivesPath), false);
    assert.equal(fs.existsSync(result.tokensPath), false);
    assert.match(result.primitivesCss, /--color-primary:\s+#00ff00;/);
    assert.match(result.tokensCss, /--color-secondary:\s+#00ff00;/);
  });

  it('resolves alias dot-paths to var() references in CSS output', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-token-css-alias-'));
    const db = createMockDbWithAlias();

    const result = await generateTokenCssFromDb({
      db,
      dsId: 'sys-01',
      repoRoot: tmpRoot,
      skipDiskWrite: true,
    });

    // Primitive stays as a concrete value.
    assert.match(result.primitivesCss, /--color-grey-100:\s+#ECECEC;/);
    // Alias token must emit var() instead of the raw Figma dot-path.
    assert.match(result.tokensCss, /--bottom-bar-background-default:\s+var\(--color-grey-100\);/);
    // tokenCatalog $value also reflects the resolved var() reference.
    const aliasEntry = result.tokenCatalog.entries.find(
      (e) => e.cssVar === '--bottom-bar-background-default',
    );
    assert.ok(aliasEntry, 'alias token entry must be present in tokenCatalog');
    assert.equal(aliasEntry.$value, 'var(--color-grey-100)');
  });

  it('flushCssToDisk writes css files after skipDiskWrite generation', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-token-css-flush-'));
    const db = createMockDb();

    const result = await generateTokenCssFromDb({
      db,
      dsId: 'sys-01',
      repoRoot: tmpRoot,
      skipDiskWrite: true,
    });

    assert.equal(fs.existsSync(result.primitivesPath), false);
    assert.equal(fs.existsSync(result.tokensPath), false);

    await flushCssToDisk(result);

    assert.equal(fs.existsSync(result.primitivesPath), true);
    assert.equal(fs.existsSync(result.tokensPath), true);
    assert.equal(fs.readFileSync(result.primitivesPath, 'utf-8'), result.primitivesCss);
    assert.equal(fs.readFileSync(result.tokensPath, 'utf-8'), result.tokensCss);
  });
});
