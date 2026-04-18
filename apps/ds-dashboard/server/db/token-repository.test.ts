import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import type { Sql } from 'postgres';

import { createTestDatabase } from './test-db-helpers.js';
import { TokenRepository } from './token-repository.js';

describe('token-repository', () => {
  let sql: Sql | undefined;
  let repo: TokenRepository | undefined;
  let cleanup: (() => Promise<void>) | undefined;
  let db: {
    prepare: (query: string) => {
      run: (...params: unknown[]) => Promise<{ lastInsertRowid?: number }>;
    };
  };

  beforeEach(async () => {
    try {
      const testDb = await createTestDatabase({
        designSystems: [{ id: 'sys-01', name: 'System 01' }],
      });
      sql = testDb.sql;
      cleanup = testDb.cleanup;
      repo = new TokenRepository(sql);
      db = {
        prepare: (query: string) => ({
          run: async (...params: unknown[]) => {
            let i = 0;
            let text = query.replace(/\?/g, () => `$${++i}`);
            if (
              /^\s*insert\s+into\s+components\b/i.test(text) &&
              !/\breturning\b/i.test(text)
            ) {
              text = `${text.trim()} RETURNING id`;
            }
            const rows = await sql!.unsafe(text, params);
            const first = rows?.[0] as { id?: number | string } | undefined;
            const idNumber =
              first?.id === undefined ? undefined : Number(first.id);
            return {
              lastInsertRowid:
                idNumber !== undefined && Number.isFinite(idNumber)
                  ? idNumber
                  : undefined,
            };
          },
        }),
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('ECONNREFUSED')) {
        throw new Error(
          'PostgreSQL not available. Set DATABASE_URL to run these tests.',
        );
      }
      throw error;
    }
  });

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
    sql = undefined;
    repo = undefined;
  });

  it('getTokenRegistry returns entries scoped by ds_id', async () => {
    await db.prepare(
      `
      INSERT INTO tokens (id, ds_id, slash_path, css_var, type, collection, raw_value)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      'color.primary',
      'sys-01',
      'color/primary',
      '--color-primary',
      'color',
      'Core',
      '{}',
    );
    await db.prepare(
      `
      INSERT INTO token_mode_values (ds_id, token_path, mode, resolved_value)
      VALUES (?, ?, ?, ?)
    `,
    ).run('sys-01', 'color.primary', 'Default', '#ffffff');

    const payload = await repo.getTokenRegistry('sys-01');
    assert.equal(payload.entries.length, 1);
    assert.equal(payload.entries[0].resolvedValue, '#ffffff');
    assert.equal(payload.byPath['color.primary'].cssVar, '--color-primary');
  });

  it('getTokenRegistry falls back to raw_value when mode values are missing', async () => {
    await db.prepare(
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

    const payload = await repo.getTokenRegistry('sys-01');
    assert.equal(payload.entries.length, 1);
    assert.equal(
      payload.entries[0].resolvedValue,
      '{"value":"8px","type":"dimension"}',
    );
  });

  it('getTokenRegistry prefers exact Default mode over other default-like mode names', async () => {
    await db.prepare(
      `
      INSERT INTO tokens (id, ds_id, slash_path, css_var, type, collection, raw_value)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      'color.primary',
      'sys-01',
      'color/primary',
      '--color-primary',
      'color',
      'Core',
      '{}',
    );

    await db.prepare(
      `
      INSERT INTO token_mode_values (ds_id, token_path, mode, resolved_value)
      VALUES (?, ?, ?, ?)
    `,
    ).run('sys-01', 'color.primary', 'default', '#111111');

    await db.prepare(
      `
      INSERT INTO token_mode_values (ds_id, token_path, mode, resolved_value)
      VALUES (?, ?, ?, ?)
    `,
    ).run('sys-01', 'color.primary', 'Default', '#ffffff');

    const payload = await repo.getTokenRegistry('sys-01');
    assert.equal(payload.entries.length, 1);
    assert.equal(payload.entries[0].resolvedValue, '#ffffff');
  });

  it('getTokenUsageIndex aggregates occurrences by token and kind', async () => {
    await db.prepare(
      `
      INSERT INTO tokens (id, ds_id, slash_path, css_var, type, collection, raw_value)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      'color.primary',
      'sys-01',
      'color/primary',
      '--color-primary',
      'color',
      'Core',
      '{}',
    );
    await db.prepare(
      `
      INSERT INTO token_usage_occurrences (ds_id, token_id, kind, source, owner, detail)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    ).run(
      'sys-01',
      'color.primary',
      'css-alias',
      'css-alias',
      'button',
      'background',
    );

    const payload = await repo.getTokenUsageIndex('sys-01');
    assert.equal(payload.summary.tokens_total, 1);
    assert.equal(payload.summary.tokens_with_usage, 1);
    assert.equal(payload.byPath['color.primary'].usageCount, 1);
    assert.equal(
      payload.byPath['color.primary'].usageByKind['css-alias'],
      1,
    );
  });

  it('getTokenGraph returns parsed graph json or null', async () => {
    assert.equal(await repo.getTokenGraph('sys-01'), null);
    await db.prepare(
      `
      INSERT INTO token_graph (ds_id, graph_json)
      VALUES (?, ?)
    `,
    ).run(
      'sys-01',
      JSON.stringify({
        ok: true,
        summary: {
          nodes: 1,
          edges: 0,
          cycles: 0,
          cycle_nodes: 0,
          unresolved_css_var_refs_total: 0,
          ambiguous_css_vars_total: 0,
          graph_collisions: 0,
        },
        source: { registry_path: '', graph_viz_path: '' },
        nodes: [],
        edges: [],
        cycles: [],
        cycle_node_ids: [],
        fingerprint: 'abc',
      }),
    );
    const graph = await repo.getTokenGraph('sys-01') as { ok: boolean };
    assert.equal(graph.ok, true);
  });

  it('getTokenGraph round-trips JSONB objects from postgres.js', async () => {
    await sql!`
      INSERT INTO token_graph (ds_id, graph_json)
      VALUES (
        ${'sys-01'},
        ${JSON.stringify({
          ok: true,
          summary: {
            nodes: 2,
            edges: 1,
            cycles: 0,
            cycle_nodes: 0,
            unresolved_css_var_refs_total: 0,
            ambiguous_css_vars_total: 0,
            graph_collisions: 0,
          },
          source: { registry_path: 'registry.json', graph_viz_path: 'graph.svg' },
          nodes: [],
          edges: [],
          cycles: [],
          cycle_node_ids: [],
          fingerprint: 'def',
        })}
      )
    `;

    const graph = await repo.getTokenGraph('sys-01') as {
      ok: boolean;
      summary: { nodes: number };
      source: { registry_path: string };
    };
    assert.equal(graph.ok, true);
    assert.equal(graph.summary.nodes, 2);
    assert.equal(graph.source.registry_path, 'registry.json');
  });

  it('getTokenRegistry returns exactly 1 row per token with multi-mode aliases', async () => {
    // Insert a token
    await db.prepare(
      `
      INSERT INTO tokens (id, ds_id, slash_path, css_var, type, collection, raw_value)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      'color.primary',
      'sys-01',
      'color/primary',
      '--color-primary',
      'color',
      'Core',
      '{}',
    );

    // Insert Default mode value
    await db.prepare(
      `
      INSERT INTO token_mode_values (ds_id, token_path, mode, resolved_value)
      VALUES (?, ?, ?, ?)
    `,
    ).run('sys-01', 'color.primary', 'Default', '#ffffff');

    // Insert two aliases with different modes
    await db.prepare(
      `
      INSERT INTO figma_aliases (ds_id, from_path, to_path, modes)
      VALUES (?, ?, ?, ?)
    `,
    ).run(
      'sys-01',
      'color.primary',
      'semantic.brand',
      JSON.stringify(['Default', 'Brand']),
    );

    await db.prepare(
      `
      INSERT INTO figma_aliases (ds_id, from_path, to_path, modes)
      VALUES (?, ?, ?, ?)
    `,
    ).run('sys-01', 'color.primary', 'other.alias', JSON.stringify(['Dark']));

    const payload = await repo.getTokenRegistry('sys-01');

    // Exactly 1 row
    assert.equal(payload.entries.length, 1);
    const entry = payload.entries[0];
    assert.equal(entry.path, 'color.primary');
    // Should prefer the Default mode alias
    assert.equal(entry.aliasOf, 'semantic.brand');
  });

  it('getTokenRegistry resolves alias when token has aliases but no token_mode_values row', async () => {
    await db.prepare(
      `
      INSERT INTO tokens (id, ds_id, slash_path, css_var, type, collection, raw_value)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      'color.ghost',
      'sys-01',
      'color/ghost',
      '--color-ghost',
      'color',
      'Core',
      '{"value":"#f0f0f0"}',
    );

    // No token_mode_values inserted on purpose.
    await db.prepare(
      `
      INSERT INTO figma_aliases (ds_id, from_path, to_path, modes)
      VALUES (?, ?, ?, ?)
    `,
    ).run(
      'sys-01',
      'color.ghost',
      'semantic.ghost.default',
      JSON.stringify(['Default']),
    );

    await db.prepare(
      `
      INSERT INTO figma_aliases (ds_id, from_path, to_path, modes)
      VALUES (?, ?, ?, ?)
    `,
    ).run(
      'sys-01',
      'color.ghost',
      'semantic.ghost.dark',
      JSON.stringify(['Dark']),
    );

    const payload = await repo.getTokenRegistry('sys-01');

    assert.equal(payload.entries.length, 1);
    const entry = payload.entries[0];
    assert.equal(entry.path, 'color.ghost');
    assert.equal(entry.resolvedValue, '{"value":"#f0f0f0"}');
    // With no winning mode available, query should still pick the stable fallback
    // that prioritizes Default aliases.
    assert.equal(entry.aliasOf, 'semantic.ghost.default');
  });

  it('getTokenRegistry falls back to stable insertion order when no winning mode and no Default alias exist', async () => {
    await db.prepare(
      `
      INSERT INTO tokens (id, ds_id, slash_path, css_var, type, collection, raw_value)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      'color.brand.cta',
      'sys-01',
      'color/brand/cta',
      '--color-brand-cta',
      'color',
      'Core',
      '{"value":"#123456"}',
    );

    // No token_mode_values and no Default aliases on purpose.
    await db.prepare(
      `
      INSERT INTO figma_aliases (ds_id, from_path, to_path, modes)
      VALUES (?, ?, ?, ?)
    `,
    ).run(
      'sys-01',
      'color.brand.cta',
      'semantic.brand.dark',
      JSON.stringify(['Dark']),
    );

    await db.prepare(
      `
      INSERT INTO figma_aliases (ds_id, from_path, to_path, modes)
      VALUES (?, ?, ?, ?)
    `,
    ).run(
      'sys-01',
      'color.brand.cta',
      'semantic.brand.high-contrast',
      JSON.stringify(['Brand']),
    );

    const payload = await repo.getTokenRegistry('sys-01');
    assert.equal(payload.entries.length, 1);
    const entry = payload.entries[0];
    assert.equal(entry.path, 'color.brand.cta');
    // Contract: when no winning mode and no Default are available, fall back to
    // a stable first-inserted alias choice (fa.id order).
    assert.equal(entry.aliasOf, 'semantic.brand.dark');
  });

  it('getTokenRegistry exposes byVariableId mapping using latest captured token binding', async () => {
    await db.prepare(
      `
      INSERT INTO tokens (id, ds_id, slash_path, css_var, type, collection, raw_value)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      'color.background.accent',
      'sys-01',
      'color/background/accent',
      '--color-background-accent',
      'color',
      'Core',
      '{}',
    );
    await db.prepare(
      `
      INSERT INTO tokens (id, ds_id, slash_path, css_var, type, collection, raw_value)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      'color.legacy',
      'sys-01',
      'color/legacy',
      '--color-legacy',
      'color',
      'Core',
      '{}',
    );
    await db.prepare(
      `
      INSERT INTO token_mode_values (ds_id, token_path, mode, resolved_value)
      VALUES (?, ?, ?, ?)
    `,
    ).run('sys-01', 'color.background.accent', 'Default', '#5B6CFF');
    await db.prepare(
      `
      INSERT INTO token_mode_values (ds_id, token_path, mode, resolved_value)
      VALUES (?, ?, ?, ?)
    `,
    ).run('sys-01', 'color.legacy', 'Default', '#000000');

    const component = await db
      .prepare(
        `
      INSERT INTO components (ds_id, slug, name)
      VALUES (?, ?, ?)
    `,
      )
      .run('sys-01', 'button', 'Button');
    const componentId = Number(component.lastInsertRowid);

    await db.prepare(
      `
      INSERT INTO component_figma_token_bindings
      (component_id, node_id, node_name, field, variable_id, token_path, mode, captured_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      componentId,
      '1:1',
      'Frame',
      'fills',
      'VariableID:1:12',
      'color.legacy',
      'Default',
      100,
    );

    await db.prepare(
      `
      INSERT INTO component_figma_token_bindings
      (component_id, node_id, node_name, field, variable_id, token_path, mode, captured_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      componentId,
      '1:2',
      'Frame',
      'fills',
      'VariableID:1:12',
      'color.background.accent',
      'Default',
      200,
    );

    const payload = await repo.getTokenRegistry('sys-01');
    assert.equal(
      payload.byVariableId['VariableID:1:12']?.path,
      'color.background.accent',
    );
    assert.equal(
      payload.byVariableId['VariableID:1:12']?.resolvedValue,
      '#5B6CFF',
    );
  });

  it('getTokenRegistry ranks latest binding across bare and prefixed variable id forms', async () => {
    await db.prepare(
      `
      INSERT INTO tokens (id, ds_id, slash_path, css_var, type, collection, raw_value)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      'color.background.accent',
      'sys-01',
      'color/background/accent',
      '--color-background-accent',
      'color',
      'Core',
      '{}',
    );
    await db.prepare(
      `
      INSERT INTO tokens (id, ds_id, slash_path, css_var, type, collection, raw_value)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      'color.legacy',
      'sys-01',
      'color/legacy',
      '--color-legacy',
      'color',
      'Core',
      '{}',
    );

    await db.prepare(
      `
      INSERT INTO token_mode_values (ds_id, token_path, mode, resolved_value)
      VALUES (?, ?, ?, ?)
    `,
    ).run('sys-01', 'color.background.accent', 'Default', '#5B6CFF');
    await db.prepare(
      `
      INSERT INTO token_mode_values (ds_id, token_path, mode, resolved_value)
      VALUES (?, ?, ?, ?)
    `,
    ).run('sys-01', 'color.legacy', 'Default', '#000000');

    const component = await db
      .prepare(
        `
      INSERT INTO components (ds_id, slug, name)
      VALUES (?, ?, ?)
    `,
      )
      .run('sys-01', 'badge', 'Badge');
    const componentId = Number(component.lastInsertRowid);

    // Older capture with prefixed variable id points to legacy token.
    await db.prepare(
      `
      INSERT INTO component_figma_token_bindings
      (component_id, node_id, node_name, field, variable_id, token_path, mode, captured_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      componentId,
      '3:1',
      'Frame',
      'fills',
      'VariableID:1:12',
      'color.legacy',
      'Default',
      100,
    );

    // Newer capture with bare id points to the correct current token.
    await db.prepare(
      `
      INSERT INTO component_figma_token_bindings
      (component_id, node_id, node_name, field, variable_id, token_path, mode, captured_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      componentId,
      '3:2',
      'Frame',
      'fills',
      '1:12',
      'color.background.accent',
      'Default',
      200,
    );

    const payload = await repo.getTokenRegistry('sys-01');
    assert.equal(payload.byVariableId['1:12']?.path, 'color.background.accent');
    assert.equal(
      payload.byVariableId['VariableID:1:12']?.path,
      'color.background.accent',
    );
  });

  it('getTokenRegistry indexes variable ids in prefixed and bare forms', async () => {
    await db.prepare(
      `
      INSERT INTO tokens (id, ds_id, slash_path, css_var, type, collection, raw_value)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      'color.background.accent',
      'sys-01',
      'color/background/accent',
      '--color-background-accent',
      'color',
      'Core',
      '{}',
    );
    await db.prepare(
      `
      INSERT INTO token_mode_values (ds_id, token_path, mode, resolved_value)
      VALUES (?, ?, ?, ?)
    `,
    ).run('sys-01', 'color.background.accent', 'Default', '#5B6CFF');

    const component = await db
      .prepare(
        `
      INSERT INTO components (ds_id, slug, name)
      VALUES (?, ?, ?)
    `,
      )
      .run('sys-01', 'chip', 'Chip');
    const componentId = Number(component.lastInsertRowid);

    await db.prepare(
      `
      INSERT INTO component_figma_token_bindings
      (component_id, node_id, node_name, field, variable_id, token_path, mode, captured_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      componentId,
      '2:1',
      'Frame',
      'fills',
      '1:12',
      'color.background.accent',
      'Default',
      100,
    );

    const payload = await repo.getTokenRegistry('sys-01');
    assert.equal(payload.byVariableId['1:12']?.path, 'color.background.accent');
    assert.equal(
      payload.byVariableId['VariableID:1:12']?.path,
      'color.background.accent',
    );
  });
});
