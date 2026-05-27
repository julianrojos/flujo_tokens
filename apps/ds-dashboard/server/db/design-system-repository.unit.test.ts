import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Sql } from 'postgres';

import { DesignSystemRepository } from './design-system-repository.ts';

describe('DesignSystemRepository unit', () => {
  it('deletes figma aliases when deleting a design system', async () => {
    const queries: string[] = [];
    const tx = async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = String.raw(strings, ...values).replace(/\s+/g, ' ').trim();
      queries.push(query);
      if (query.includes('DELETE FROM tokens WHERE ds_id =')) {
        return { count: 1 };
      }
      if (query.includes('DELETE FROM figma_aliases WHERE ds_id =')) {
        return { count: 1 };
      }
      if (query.includes("SELECT to_regclass('document_chunks') AS regclass")) {
        return [{ regclass: null }];
      }
      if (query.includes('DELETE FROM design_systems WHERE id =')) {
        return { count: 1 };
      }
      throw new Error(`Unexpected query: ${query}`);
    };
    const sql = {
      begin: async (callback: (tx: typeof tx) => Promise<void>) => {
        await callback(tx);
      },
    } as unknown as Sql;

    const repo = new DesignSystemRepository(sql);
    const deleted = await repo.delete('sys-1');

    assert.equal(deleted, true);
    assert.deepEqual(queries, [
      'DELETE FROM tokens WHERE ds_id = sys-1',
      'DELETE FROM figma_aliases WHERE ds_id = sys-1',
      "SELECT to_regclass('document_chunks') AS regclass",
      'DELETE FROM design_systems WHERE id = sys-1',
    ]);
  });
});
