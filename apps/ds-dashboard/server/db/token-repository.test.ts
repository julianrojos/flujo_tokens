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

  it('getTokenRegistry returns exactly 1 row per token with multi-mode aliases', () => {
    // Insert a token
    db.prepare(
      `
      INSERT INTO tokens (id, ds_id, slash_path, css_var, type, collection, raw_value)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    ).run('color.primary', 'sys-01', 'color/primary', '--color-primary', 'color', 'Core', '{}');

    // Insert Default mode value
    db.prepare(
      `
      INSERT INTO token_mode_values (ds_id, token_path, mode, resolved_value)
      VALUES (?, ?, ?, ?)
    `,
    ).run('sys-01', 'color.primary', 'Default', '#ffffff');

    // Insert two aliases with different modes
    db.prepare(
      `
      INSERT INTO figma_aliases (ds_id, from_path, to_path, modes)
      VALUES (?, ?, ?, ?)
    `,
    ).run('sys-01', 'color.primary', 'semantic.brand', JSON.stringify(['Default', 'Brand']));

    db.prepare(
      `
      INSERT INTO figma_aliases (ds_id, from_path, to_path, modes)
      VALUES (?, ?, ?, ?)
    `,
    ).run('sys-01', 'color.primary', 'other.alias', JSON.stringify(['Dark']));

    const payload = repo.getTokenRegistry('sys-01');

    // Exactly 1 row
    assert.equal(payload.entries.length, 1);
    const entry = payload.entries[0];
    assert.equal(entry.path, 'color.primary');
    // Should prefer the Default mode alias
    assert.equal(entry.aliasOf, 'semantic.brand');
  });

  it('getTokenRegistry resolves alias when token has aliases but no token_mode_values row', () => {
    db.prepare(
      `
      INSERT INTO tokens (id, ds_id, slash_path, css_var, type, collection, raw_value)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    ).run('color.ghost', 'sys-01', 'color/ghost', '--color-ghost', 'color', 'Core', '{"value":"#f0f0f0"}');

    // No token_mode_values inserted on purpose.
    db.prepare(
      `
      INSERT INTO figma_aliases (ds_id, from_path, to_path, modes)
      VALUES (?, ?, ?, ?)
    `,
    ).run('sys-01', 'color.ghost', 'semantic.ghost.default', JSON.stringify(['Default']));

    db.prepare(
      `
      INSERT INTO figma_aliases (ds_id, from_path, to_path, modes)
      VALUES (?, ?, ?, ?)
    `,
    ).run('sys-01', 'color.ghost', 'semantic.ghost.dark', JSON.stringify(['Dark']));

    const payload = repo.getTokenRegistry('sys-01');

    assert.equal(payload.entries.length, 1);
    const entry = payload.entries[0];
    assert.equal(entry.path, 'color.ghost');
    assert.equal(entry.resolvedValue, '{"value":"#f0f0f0"}');
    // With no winning mode available, query should still pick the stable fallback
    // that prioritizes Default aliases.
    assert.equal(entry.aliasOf, 'semantic.ghost.default');
  });

  it('getTokenRegistry falls back to stable insertion order when no winning mode and no Default alias exist', () => {
    db.prepare(
      `
      INSERT INTO tokens (id, ds_id, slash_path, css_var, type, collection, raw_value)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    ).run('color.brand.cta', 'sys-01', 'color/brand/cta', '--color-brand-cta', 'color', 'Core', '{"value":"#123456"}');

    // No token_mode_values and no Default aliases on purpose.
    db.prepare(
      `
      INSERT INTO figma_aliases (ds_id, from_path, to_path, modes)
      VALUES (?, ?, ?, ?)
    `,
    ).run('sys-01', 'color.brand.cta', 'semantic.brand.dark', JSON.stringify(['Dark']));

    db.prepare(
      `
      INSERT INTO figma_aliases (ds_id, from_path, to_path, modes)
      VALUES (?, ?, ?, ?)
    `,
    ).run('sys-01', 'color.brand.cta', 'semantic.brand.high-contrast', JSON.stringify(['Brand']));

    const payload = repo.getTokenRegistry('sys-01');
    assert.equal(payload.entries.length, 1);
    const entry = payload.entries[0];
    assert.equal(entry.path, 'color.brand.cta');
    // Contract: when no winning mode and no Default are available, fall back to
    // a stable first-inserted alias choice (fa.id order).
    assert.equal(entry.aliasOf, 'semantic.brand.dark');
  });

  it('getTokenRegistry exposes byVariableId mapping using latest captured token binding', () => {
    db.prepare(
      `
      INSERT INTO tokens (id, ds_id, slash_path, css_var, type, collection, raw_value)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    ).run('color.background.accent', 'sys-01', 'color/background/accent', '--color-background-accent', 'color', 'Core', '{}');
    db.prepare(
      `
      INSERT INTO tokens (id, ds_id, slash_path, css_var, type, collection, raw_value)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    ).run('color.legacy', 'sys-01', 'color/legacy', '--color-legacy', 'color', 'Core', '{}');
    db.prepare(
      `
      INSERT INTO token_mode_values (ds_id, token_path, mode, resolved_value)
      VALUES (?, ?, ?, ?)
    `,
    ).run('sys-01', 'color.background.accent', 'Default', '#5B6CFF');
    db.prepare(
      `
      INSERT INTO token_mode_values (ds_id, token_path, mode, resolved_value)
      VALUES (?, ?, ?, ?)
    `,
    ).run('sys-01', 'color.legacy', 'Default', '#000000');

    const component = db.prepare(
      `
      INSERT INTO components (ds_id, slug, name)
      VALUES (?, ?, ?)
    `,
    ).run('sys-01', 'button', 'Button');
    const componentId = Number(component.lastInsertRowid);

    db.prepare(
      `
      INSERT INTO component_figma_token_bindings
      (component_id, node_id, node_name, field, variable_id, token_path, mode, captured_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(componentId, '1:1', 'Frame', 'fills', 'VariableID:1:12', 'color.legacy', 'Default', 100);

    db.prepare(
      `
      INSERT INTO component_figma_token_bindings
      (component_id, node_id, node_name, field, variable_id, token_path, mode, captured_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(componentId, '1:2', 'Frame', 'fills', 'VariableID:1:12', 'color.background.accent', 'Default', 200);

    const payload = repo.getTokenRegistry('sys-01');
    assert.equal(payload.byVariableId['VariableID:1:12']?.path, 'color.background.accent');
    assert.equal(payload.byVariableId['VariableID:1:12']?.resolvedValue, '#5B6CFF');
  });

  it('getTokenRegistry ranks latest binding across bare and prefixed variable id forms', () => {
    db.prepare(
      `
      INSERT INTO tokens (id, ds_id, slash_path, css_var, type, collection, raw_value)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    ).run('color.background.accent', 'sys-01', 'color/background/accent', '--color-background-accent', 'color', 'Core', '{}');
    db.prepare(
      `
      INSERT INTO tokens (id, ds_id, slash_path, css_var, type, collection, raw_value)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    ).run('color.legacy', 'sys-01', 'color/legacy', '--color-legacy', 'color', 'Core', '{}');

    db.prepare(
      `
      INSERT INTO token_mode_values (ds_id, token_path, mode, resolved_value)
      VALUES (?, ?, ?, ?)
    `,
    ).run('sys-01', 'color.background.accent', 'Default', '#5B6CFF');
    db.prepare(
      `
      INSERT INTO token_mode_values (ds_id, token_path, mode, resolved_value)
      VALUES (?, ?, ?, ?)
    `,
    ).run('sys-01', 'color.legacy', 'Default', '#000000');

    const component = db.prepare(
      `
      INSERT INTO components (ds_id, slug, name)
      VALUES (?, ?, ?)
    `,
    ).run('sys-01', 'badge', 'Badge');
    const componentId = Number(component.lastInsertRowid);

    // Older capture with prefixed variable id points to legacy token.
    db.prepare(
      `
      INSERT INTO component_figma_token_bindings
      (component_id, node_id, node_name, field, variable_id, token_path, mode, captured_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(componentId, '3:1', 'Frame', 'fills', 'VariableID:1:12', 'color.legacy', 'Default', 100);

    // Newer capture with bare id points to the correct current token.
    db.prepare(
      `
      INSERT INTO component_figma_token_bindings
      (component_id, node_id, node_name, field, variable_id, token_path, mode, captured_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(componentId, '3:2', 'Frame', 'fills', '1:12', 'color.background.accent', 'Default', 200);

    const payload = repo.getTokenRegistry('sys-01');
    assert.equal(payload.byVariableId['1:12']?.path, 'color.background.accent');
    assert.equal(payload.byVariableId['VariableID:1:12']?.path, 'color.background.accent');
  });

  it('getTokenRegistry indexes variable ids in prefixed and bare forms', () => {
    db.prepare(
      `
      INSERT INTO tokens (id, ds_id, slash_path, css_var, type, collection, raw_value)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    ).run('color.background.accent', 'sys-01', 'color/background/accent', '--color-background-accent', 'color', 'Core', '{}');
    db.prepare(
      `
      INSERT INTO token_mode_values (ds_id, token_path, mode, resolved_value)
      VALUES (?, ?, ?, ?)
    `,
    ).run('sys-01', 'color.background.accent', 'Default', '#5B6CFF');

    const component = db.prepare(
      `
      INSERT INTO components (ds_id, slug, name)
      VALUES (?, ?, ?)
    `,
    ).run('sys-01', 'chip', 'Chip');
    const componentId = Number(component.lastInsertRowid);

    db.prepare(
      `
      INSERT INTO component_figma_token_bindings
      (component_id, node_id, node_name, field, variable_id, token_path, mode, captured_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(componentId, '2:1', 'Frame', 'fills', '1:12', 'color.background.accent', 'Default', 100);

    const payload = repo.getTokenRegistry('sys-01');
    assert.equal(payload.byVariableId['1:12']?.path, 'color.background.accent');
    assert.equal(payload.byVariableId['VariableID:1:12']?.path, 'color.background.accent');
  });
});
