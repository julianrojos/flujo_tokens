import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import type Database from 'better-sqlite3';

import { bootstrapDatabase } from './db-service.js';
import { TokenRepository } from './token-repository.js';

describe('token-repository', () => {
  let db: Database.Database;
  let repo: TokenRepository;

  beforeEach(() => {
    db = bootstrapDatabase({ dbPath: ':memory:' });
    repo = new TokenRepository(db);
    db.prepare(
      `
      INSERT INTO design_systems (id, name, compile_variables_on_capture)
      VALUES ('sys-01', 'System 01', 1)
    `,
    ).run();
  });

  afterEach(() => {
    db.close();
  });

  it('getTokenRegistry returns entries scoped by ds_id', () => {
    db.prepare(
      `
      INSERT INTO tokens (id, ds_id, slash_path, css_var, type, collection, raw_value)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    ).run('color.primary', 'sys-01', 'color/primary', '--color-primary', 'color', 'Core', '{}');
    db.prepare(
      `
      INSERT INTO token_mode_values (ds_id, token_path, mode, resolved_value)
      VALUES (?, ?, ?, ?)
    `,
    ).run('sys-01', 'color.primary', 'Default', '#ffffff');

    const payload = repo.getTokenRegistry('sys-01');
    assert.equal(payload.entries.length, 1);
    assert.equal(payload.entries[0].resolvedValue, '#ffffff');
    assert.equal(payload.byPath['color.primary'].cssVar, '--color-primary');
  });

  it('getTokenRegistry falls back to raw_value when mode values are missing', () => {
    db.prepare(
      `
      INSERT INTO tokens (id, ds_id, slash_path, css_var, type, collection, raw_value)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      'spacing.sm',
      'sys-01',
      'spacing/sm',
      '--spacing-sm',
      'dimension',
      'Core',
      '{"value":"8px","type":"dimension"}',
    );

    const payload = repo.getTokenRegistry('sys-01');
    assert.equal(payload.entries.length, 1);
    assert.equal(payload.entries[0].resolvedValue, '{"value":"8px","type":"dimension"}');
  });

  it('getTokenRegistry prefers exact Default mode over other default-like mode names', () => {
    db.prepare(
      `
      INSERT INTO tokens (id, ds_id, slash_path, css_var, type, collection, raw_value)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    ).run('color.primary', 'sys-01', 'color/primary', '--color-primary', 'color', 'Core', '{}');

    db.prepare(
      `
      INSERT INTO token_mode_values (ds_id, token_path, mode, resolved_value)
      VALUES (?, ?, ?, ?)
    `,
    ).run('sys-01', 'color.primary', 'default', '#111111');

    db.prepare(
      `
      INSERT INTO token_mode_values (ds_id, token_path, mode, resolved_value)
      VALUES (?, ?, ?, ?)
    `,
    ).run('sys-01', 'color.primary', 'Default', '#ffffff');

    const payload = repo.getTokenRegistry('sys-01');
    assert.equal(payload.entries.length, 1);
    assert.equal(payload.entries[0].resolvedValue, '#ffffff');
  });

  it('getTokenUsageIndex aggregates occurrences by token and kind', () => {
    db.prepare(
      `
      INSERT INTO tokens (id, ds_id, slash_path, css_var, type, collection, raw_value)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    ).run('color.primary', 'sys-01', 'color/primary', '--color-primary', 'color', 'Core', '{}');
    db.prepare(
      `
      INSERT INTO token_usage_occurrences (ds_id, token_id, kind, source, owner, detail)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    ).run('sys-01', 'color.primary', 'component-spec', 'component-spec', 'button', 'background');

    const payload = repo.getTokenUsageIndex('sys-01');
    assert.equal(payload.summary.tokens_total, 1);
    assert.equal(payload.summary.tokens_with_usage, 1);
    assert.equal(payload.byPath['color.primary'].usageCount, 1);
    assert.equal(payload.byPath['color.primary'].usageByKind['component-spec'], 1);
  });

  it('getTokenGraph returns parsed graph json or null', () => {
    assert.equal(repo.getTokenGraph('sys-01'), null);
    db.prepare(
      `
      INSERT INTO token_graph (ds_id, graph_json)
      VALUES (?, ?)
    `,
    ).run(
      'sys-01',
      JSON.stringify({
        ok: true,
        summary: { nodes: 1, edges: 0, cycles: 0, cycle_nodes: 0, unresolved_css_var_refs_total: 0, ambiguous_css_vars_total: 0, graph_collisions: 0 },
        source: { registry_path: '', graph_viz_path: '' },
        nodes: [],
        edges: [],
        cycles: [],
        cycle_node_ids: [],
        fingerprint: 'abc',
      }),
    );
    const graph = repo.getTokenGraph('sys-01') as { ok: boolean };
    assert.equal(graph.ok, true);
  });
});
