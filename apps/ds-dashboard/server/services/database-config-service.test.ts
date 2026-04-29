import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  getDatabaseConfigPayload,
  handleGetDatabaseConfigRoute,
  maskDatabaseUrl,
  runWithTimeout,
  saveDatabaseConfig,
} from './database-config-service.js';

const tempRoots: string[] = [];
const originalInternalToken = process.env.DS_DASHBOARD_INTERNAL_TOKEN;

async function createTempRepoRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ds-db-config-'));
  tempRoots.push(root);
  await fs.mkdir(path.join(root, 'apps', 'ds-dashboard'), { recursive: true });
  return root;
}

describe('database-config-service', () => {
  afterEach(async () => {
    if (originalInternalToken === undefined) {
      delete process.env.DS_DASHBOARD_INTERNAL_TOKEN;
    } else {
      process.env.DS_DASHBOARD_INTERNAL_TOKEN = originalInternalToken;
    }
    await Promise.all(
      tempRoots
        .splice(0)
        .map((root) => fs.rm(root, { recursive: true, force: true })),
    );
  });

  it('masks database passwords', () => {
    assert.equal(
      maskDatabaseUrl(
        'postgresql://postgres:secret@db.demo.supabase.co:5432/postgres',
      ),
      'postgresql://postgres:***@db.demo.supabase.co:5432/postgres',
    );
  });

  it('reports local fallback configuration', () => {
    const payload = getDatabaseConfigPayload({
      repoRoot: '/repo',
      activeDatabaseUrl: 'postgres://ds:local@localhost:5432/ds_dashboard',
      env: {},
    });

    assert.equal(payload.provider, 'local');
    assert.equal(payload.databaseUrlConfigured, false);
    assert.equal(payload.restartRequired, false);
  });

  it('saves Supabase configuration to the dashboard env file', async () => {
    const repoRoot = await createTempRepoRoot();
    const env: NodeJS.ProcessEnv = {};
    const databaseUrl =
      'postgresql://postgres:secret@db.demo.supabase.co:5432/postgres?sslmode=require';

    const result = await saveDatabaseConfig({
      repoRoot,
      activeDatabaseUrl: 'postgres://ds:local@localhost:5432/ds_dashboard',
      env,
      provider: 'supabase',
      databaseUrl,
    });

    const envText = await fs.readFile(
      path.join(repoRoot, 'apps', 'ds-dashboard', '.env'),
      'utf8',
    );
    assert.match(envText, /DB_PROVIDER=supabase/);
    assert.match(envText, /SUPABASE_DATABASE_URL=/);
    assert.equal(env.DB_PROVIDER, undefined);
    assert.equal(env.DATABASE_URL, undefined);
    assert.equal(result.restartRequired, true);
  });

  it('clears saved Supabase configuration when saving local provider', async () => {
    const repoRoot = await createTempRepoRoot();
    const env: NodeJS.ProcessEnv = {
      DB_PROVIDER: 'supabase',
      DATABASE_URL:
        'postgresql://postgres:secret@db.demo.supabase.co:5432/postgres?sslmode=require',
      SUPABASE_DATABASE_URL:
        'postgresql://postgres:secret@db.demo.supabase.co:5432/postgres?sslmode=require',
    };

    await saveDatabaseConfig({
      repoRoot,
      activeDatabaseUrl:
        'postgresql://postgres:secret@db.demo.supabase.co:5432/postgres?sslmode=require',
      env,
      provider: 'local',
      databaseUrl: 'postgres://ds:local@localhost:5432/ds_dashboard',
    });

    const envText = await fs.readFile(
      path.join(repoRoot, 'apps', 'ds-dashboard', '.env'),
      'utf8',
    );
    assert.match(envText, /DB_PROVIDER=local/);
    assert.match(envText, /DATABASE_URL=postgres:\/\/ds:local@localhost:5432\/ds_dashboard/);
    assert.match(envText, /SUPABASE_DATABASE_URL=""/);
  });

  it('keeps the saved URL when saving with an empty database URL', async () => {
    const repoRoot = await createTempRepoRoot();
    const databaseUrl =
      'postgresql://postgres:secret@db.demo.supabase.co:5432/postgres?sslmode=require';
    const env: NodeJS.ProcessEnv = {
      DB_PROVIDER: 'supabase',
      DATABASE_URL: databaseUrl,
      SUPABASE_DATABASE_URL: databaseUrl,
    };

    const result = await saveDatabaseConfig({
      repoRoot,
      activeDatabaseUrl: 'postgres://ds:local@localhost:5432/ds_dashboard',
      env,
      provider: 'supabase',
      databaseUrl: '',
    });

    const envText = await fs.readFile(
      path.join(repoRoot, 'apps', 'ds-dashboard', '.env'),
      'utf8',
    );
    assert.match(envText, /DB_PROVIDER=supabase/);
    assert.match(envText, /DATABASE_URL=/);
    assert.match(envText, /SUPABASE_DATABASE_URL=/);
    assert.equal(result.databaseUrlMasked.includes('***'), true);
    assert.equal(result.restartRequired, true);
  });

  it('reports restart required when saving a new URL without an active URL override', async () => {
    const repoRoot = await createTempRepoRoot();
    const env: NodeJS.ProcessEnv = {
      DB_PROVIDER: 'local',
      DATABASE_URL: 'postgres://ds:local@localhost:5432/ds_dashboard',
    };

    const result = await saveDatabaseConfig({
      repoRoot,
      env,
      provider: 'supabase',
      databaseUrl:
        'postgresql://postgres:secret@db.demo.supabase.co:5432/postgres?sslmode=require',
    });

    assert.equal(result.restartRequired, true);
    assert.equal(result.activeProvider, 'local');
    assert.equal(result.restartCommand, 'npm run dashboard:dev');
    assert.equal(env.DB_PROVIDER, 'local');
  });

  it('reads saved database config from the dashboard env file after save', async () => {
    process.env.DS_DASHBOARD_INTERNAL_TOKEN = 'secret-token';
    const repoRoot = await createTempRepoRoot();
    const env: NodeJS.ProcessEnv = {
      DB_PROVIDER: 'local',
      DATABASE_URL: 'postgres://ds:local@localhost:5432/ds_dashboard',
    };
    const databaseUrl =
      'postgresql://postgres:secret@db.demo.supabase.co:5432/postgres?sslmode=require';

    await saveDatabaseConfig({
      repoRoot,
      activeDatabaseUrl: env.DATABASE_URL,
      env,
      provider: 'supabase',
      databaseUrl,
    });

    const response = await handleGetDatabaseConfigRoute(
      {
        req: {
          header: (name: string) =>
            name === 'x-ds-dashboard-internal-token' ? 'secret-token' : '',
        },
        json: (payload: unknown) =>
          new Response(JSON.stringify(payload), {
            headers: { 'Content-Type': 'application/json' },
          }),
      } as never,
      {
        repoRoot,
        activeDatabaseUrl: env.DATABASE_URL,
        env,
        failJson: (_c, statusCode, args) =>
          new Response(JSON.stringify(args), { status: statusCode }),
      },
    );
    const payload = await response.json();

    assert.equal(payload.config.provider, 'supabase');
    assert.equal(payload.config.activeProvider, 'local');
    assert.equal(payload.config.restartRequired, true);
    assert.match(payload.config.databaseUrlMasked, /postgres:\*\*\*/);
  });

  it('times out validation operations and runs timeout cleanup', async () => {
    let cleanedUp = false;
    await assert.rejects(
      () =>
        runWithTimeout({
          operation: new Promise<string>(() => {}),
          timeoutMs: 1,
          onTimeout: async () => {
            cleanedUp = true;
          },
        }),
      /Database validation timed out after 1ms/,
    );
    assert.equal(cleanedUp, true);
  });

  it('parses single-quoted env values without JSON.parse', async () => {
    const repoRoot = await createTempRepoRoot();
    const envText = [
      "DB_PROVIDER='supabase'",
      "DATABASE_URL='postgresql://postgres:secret@db.demo.supabase.co:5432/postgres?sslmode=require'",
    ].join('\n');
    await fs.writeFile(path.join(repoRoot, 'apps', 'ds-dashboard', '.env'), envText);

    process.env.DS_DASHBOARD_INTERNAL_TOKEN = 'secret-token';
    const response = await handleGetDatabaseConfigRoute(
      {
        req: {
          header: (name: string) =>
            name === 'x-ds-dashboard-internal-token' ? 'secret-token' : '',
        },
        json: (payload: unknown) =>
          new Response(JSON.stringify(payload), {
            headers: { 'Content-Type': 'application/json' },
          }),
      } as never,
      {
        repoRoot,
        activeDatabaseUrl:
          'postgres://ds:local@localhost:5432/ds_dashboard',
        env: {},
        failJson: (_c, statusCode, args) =>
          new Response(JSON.stringify(args), { status: statusCode }),
      },
    );
    const payload = await response.json();

    assert.equal(payload.config.provider, 'supabase');
    assert.equal(payload.config.databaseUrlConfigured, true);
  });

  it('blocks database config routes without loopback or internal token', async () => {
    delete process.env.DS_DASHBOARD_INTERNAL_TOKEN;
    const response = await handleGetDatabaseConfigRoute(
      {
        req: { header: () => '' },
      } as never,
      {
        repoRoot: '/repo',
        activeDatabaseUrl: 'postgres://ds:local@localhost:5432/ds_dashboard',
        failJson: (_c, statusCode, args) =>
          new Response(JSON.stringify(args), { status: statusCode }),
      },
    );

    assert.equal(response.status, 403);
    assert.match(await response.text(), /database_config\.forbidden_remote/);
  });

  it('allows database config routes with the internal token', async () => {
    process.env.DS_DASHBOARD_INTERNAL_TOKEN = 'secret-token';
    const response = await handleGetDatabaseConfigRoute(
      {
        req: {
          header: (name: string) =>
            name === 'x-ds-dashboard-internal-token' ? 'secret-token' : '',
        },
        json: (payload: unknown) =>
          new Response(JSON.stringify(payload), {
            headers: { 'Content-Type': 'application/json' },
          }),
      } as never,
      {
        repoRoot: '/repo',
        activeDatabaseUrl: 'postgres://ds:local@localhost:5432/ds_dashboard',
        failJson: (_c, statusCode, args) =>
          new Response(JSON.stringify(args), { status: statusCode }),
      },
    );

    assert.equal(response.status, 200);
    assert.equal((await response.json()).ok, true);
  });
});
