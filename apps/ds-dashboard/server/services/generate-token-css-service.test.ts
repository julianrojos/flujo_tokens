import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { Sql } from 'postgres';

import { generateTokenCssFromDb } from './generate-token-css-service.ts';

describe('generate-token-css-service', () => {
  it('returns split css contents and token catalog entries from db state', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-token-css-'));
    const db = (async (
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
});
