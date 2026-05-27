import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Sql } from 'postgres';

import { DependencyRepository } from './dependency-repository.ts';

describe('DependencyRepository unit', () => {
  it('trims file keys when adding consumers and looking them up', async () => {
    const storedById = new Map<string, {
      id: string;
      ds_file_key: string;
      consumer_file_key: string;
      consumer_name: string;
      created_at: Date;
    }>();
    let lastInsertRow: {
      id: string;
      ds_file_key: string;
      consumer_file_key: string;
      consumer_name: string;
      created_at: Date;
    } | null = null;

    const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = String.raw(strings, ...values).replace(/\s+/g, ' ').trim();
      if (query.startsWith('INSERT INTO ds_consumers')) {
        const [id, dsFileKey, consumerFileKey, consumerName] = values as [
          string,
          string,
          string,
          string,
        ];
        lastInsertRow = {
          id,
          ds_file_key: dsFileKey,
          consumer_file_key: consumerFileKey,
          consumer_name: consumerName,
          created_at: new Date('2026-05-27T00:00:00.000Z'),
        };
        storedById.set(id, lastInsertRow);
        return { count: 1 };
      }

      if (query.startsWith('SELECT * FROM ds_consumers WHERE id =')) {
        const id = String(values[0] ?? '');
        const row = storedById.get(id);
        return row ? [row] : [];
      }

      if (query.startsWith('SELECT * FROM ds_consumers WHERE ds_file_key =')) {
        const [dsFileKey, consumerFileKey] = values as [string, string];
        const row = [...storedById.values()].find(
          (entry) =>
            entry.ds_file_key === dsFileKey &&
            entry.consumer_file_key === consumerFileKey,
        );
        return row ? [row] : [];
      }

      throw new Error(`Unexpected query: ${query}`);
    }) as unknown as Sql;

    const repo = new DependencyRepository(sql);
    const created = await repo.addConsumer({
      ds_file_key: '  ds-1  ',
      consumer_file_key: '  consumer-1  ',
      consumer_name: '  Consumer 1  ',
    });

    assert.equal(created.ds_file_key, 'ds-1');
    assert.equal(created.consumer_file_key, 'consumer-1');
    assert.equal(created.consumer_name, 'Consumer 1');
    assert.ok(lastInsertRow);
    assert.equal(lastInsertRow?.ds_file_key, 'ds-1');
    assert.equal(lastInsertRow?.consumer_file_key, 'consumer-1');

    const byKeys = await repo.getConsumerByFileKeys(' ds-1 ', ' consumer-1 ');
    assert.ok(byKeys);
    assert.equal(byKeys?.id, created.id);
  });
});
