/**
 * PostgreSQL DB Service Tests
 *
 * Tests for PostgreSQL database operations, migrations, and connection management.
 */

import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import * as fsSync from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import {
  openDatabase,
  runMigrations,
  loadMigrationsFromDir,
  resolveDashboardDbUrl,
  resolveDatabaseProvider,
  resolvePostgresConnectionOptions,
  type MigrationEntry,
} from './pg-db-service.js';
import { createTestDatabase } from './test-db-helpers.js';
import type { Sql } from 'postgres';

describe('pg-db-service', () => {
  describe('bootstrapDatabase()', () => {
    let sql: Sql;
    let cleanup: () => Promise<void>;

    before(async () => {
      ({ sql, cleanup } = await createTestDatabase());
    });

    after(async () => {
      await cleanup();
    });

    it('creates all expected tables from migrations', async () => {
      const expectedTables = [
        'schema_migrations',
        'db_meta',
        'tokens',
        'figma_aliases',
        'ai_jobs',
        'job_events',
        'design_systems',
        'components',
      ];

      for (const tableName of expectedTables) {
        const rows = await sql`
          SELECT tablename FROM pg_tables
          WHERE schemaname = current_schema()
          AND tablename = ${tableName}
        `;
        assert.ok(rows.length > 0, `${tableName} table should exist`);
      }
    });

    it('records applied migrations in schema_migrations', async () => {
      const migrations = await sql`
        SELECT version FROM schema_migrations ORDER BY version
      `;
      assert.ok(
        migrations.length > 0,
        'At least one migration should be recorded',
      );
      assert.strictEqual(
        Number(migrations[0].version),
        1,
        'First migration should be version 1',
      );
    });

    it('component_editorial does not have legacy columns', async () => {
      const columns = await sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = current_schema()
        AND table_name = 'component_editorial'
      `;
      const columnNames = columns.map((c) => c.column_name);
      assert.ok(
        columnNames.includes('variants_json'),
        'variants_json should exist',
      );
      assert.ok(
        !columnNames.includes('properties_json'),
        'properties_json should not exist',
      );
      assert.ok(
        columnNames.includes('behaviour_json'),
        'behaviour_json should exist',
      );
      assert.ok(
        !columnNames.includes('tokens_json'),
        'tokens_json should not exist',
      );
      assert.ok(
        !columnNames.includes('token_mapping_json'),
        'token_mapping_json should not exist',
      );
      assert.ok(
        !columnNames.includes('best_practices_json'),
        'best_practices_json should not exist',
      );
      assert.ok(
        !columnNames.includes('related_components_json'),
        'related_components_json should not exist',
      );
    });

    it('ds_consumers does not have legacy sync/stale columns', async () => {
      const columns = await sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = current_schema()
        AND table_name = 'ds_consumers'
      `;
      const columnNames = columns.map((c) => c.column_name);
      assert.ok(
        !columnNames.includes('sync_interval_hours'),
        'sync_interval_hours should not exist',
      );
      assert.ok(
        !columnNames.includes('max_stale_hours'),
        'max_stale_hours should not exist',
      );
    });

    it('creates all expected indexes', async () => {
      const expectedIndexes = [
        'idx_tokens_ds_id',
        'idx_tokens_ds_id_id',
        'idx_ai_jobs_status',
        'idx_ai_jobs_idempotency_key',
        'idx_job_events_job_id',
      ];

      for (const indexName of expectedIndexes) {
        const rows = await sql`
          SELECT indexname FROM pg_indexes
          WHERE schemaname = current_schema()
          AND indexname = ${indexName}
        `;
        assert.ok(rows.length > 0, `${indexName} index should exist`);
      }
    });
  });

  describe('loadMigrationsFromDir()', () => {
    const migrationsDir = path.join(__dirname, 'migrations-pg');

    it('loads migrations from directory', () => {
      const migrations = loadMigrationsFromDir(migrationsDir);
      assert.ok(Array.isArray(migrations));
      assert.ok(migrations.length > 0);
    });

    it('loads migrations sorted by version', () => {
      const migrations = loadMigrationsFromDir(migrationsDir);
      for (let i = 1; i < migrations.length; i++) {
        assert.ok(migrations[i].version > migrations[i - 1].version);
      }
    });

    it('throws for non-existent directory', () => {
      assert.throws(() => {
        loadMigrationsFromDir('/non/existent/path');
      }, /Migrations directory does not exist/);
    });

    it('throws for non-directory path', () => {
      const testFile = path.join(__dirname, 'pg-db-service.ts');
      assert.throws(() => {
        loadMigrationsFromDir(testFile);
      }, /path is not a directory/);
    });

    it('ignores non-SQL files in migrations directory', () => {
      const migrations = loadMigrationsFromDir(migrationsDir);
      const nonSqlFile = path.join(migrationsDir, 'README.txt');
      fsSync.writeFileSync(nonSqlFile, 'This is not SQL');
      try {
        const migrationsAfter = loadMigrationsFromDir(migrationsDir);
        assert.strictEqual(migrations.length, migrationsAfter.length);
      } finally {
        fsSync.unlinkSync(nonSqlFile);
      }
    });

    it('returns empty array for empty migrations directory', () => {
      const emptyDir = path.join(__dirname, 'empty-migrations-test');
      fsSync.mkdirSync(emptyDir, { recursive: true });
      try {
        const migrations = loadMigrationsFromDir(emptyDir);
        assert.strictEqual(migrations.length, 0);
      } finally {
        fsSync.rmdirSync(emptyDir);
      }
    });
  });

  describe('resolveDashboardDbUrl()', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it('falls back to the local dashboard database when DATABASE_URL is not set', () => {
      delete process.env.DATABASE_URL;
      delete process.env.TEST_DATABASE_URL;
      delete process.env.NODE_ENV;

      const result = resolveDashboardDbUrl();

      assert.strictEqual(
        result,
        'postgres://ds:local@localhost:5432/ds_dashboard',
      );
    });

    it('throws in production when DATABASE_URL is not set', () => {
      delete process.env.DATABASE_URL;
      delete process.env.TEST_DATABASE_URL;
      process.env.NODE_ENV = 'production';

      assert.throws(() => {
        resolveDashboardDbUrl();
      }, /Database configuration is required in production/);
    });

    it('returns DATABASE_URL when set', () => {
      process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';
      const result = resolveDashboardDbUrl();
      assert.strictEqual(result, 'postgres://test:test@localhost:5432/test');
    });

    it('prefers TEST_DATABASE_URL over DATABASE_URL in test environments', () => {
      process.env.NODE_ENV = 'test';
      process.env.DATABASE_URL = 'postgres://prod:test@localhost:5432/prod';
      process.env.TEST_DATABASE_URL =
        'postgres://test:test@localhost:5432/test';

      const result = resolveDashboardDbUrl();

      assert.strictEqual(result, 'postgres://test:test@localhost:5432/test');
    });

    it('uses SUPABASE_DATABASE_URL when DB_PROVIDER is supabase', () => {
      process.env.DB_PROVIDER = 'supabase';
      process.env.SUPABASE_DATABASE_URL =
        'postgresql://postgres:secret@db.demo.supabase.co:5432/postgres?sslmode=require';

      const result = resolveDashboardDbUrl();

      assert.strictEqual(
        result,
        'postgresql://postgres:secret@db.demo.supabase.co:5432/postgres?sslmode=require',
      );
    });

    it('requires a Supabase URL when DB_PROVIDER is supabase', () => {
      delete process.env.DATABASE_URL;
      delete process.env.TEST_DATABASE_URL;
      delete process.env.SUPABASE_DATABASE_URL;
      process.env.DB_PROVIDER = 'supabase';

      assert.throws(() => {
        resolveDashboardDbUrl();
      }, /SUPABASE_DATABASE_URL or DATABASE_URL is required/);
    });
  });

  describe('resolveDatabaseProvider()', () => {
    it('infers supabase from Supabase hosts', () => {
      assert.strictEqual(
        resolveDatabaseProvider({
          DATABASE_URL:
            'postgresql://postgres:secret@db.demo.supabase.co:5432/postgres',
        } as NodeJS.ProcessEnv),
        'supabase',
      );
    });

    it('prefers explicit DB_PROVIDER', () => {
      assert.strictEqual(
        resolveDatabaseProvider({
          DB_PROVIDER: 'custom',
          DATABASE_URL:
            'postgresql://postgres:secret@db.demo.supabase.co:5432/postgres',
        } as NodeJS.ProcessEnv),
        'custom',
      );
    });
  });

  describe('resolvePostgresConnectionOptions()', () => {
    it('requires SSL for Supabase', () => {
      const options = resolvePostgresConnectionOptions(
        'postgresql://postgres:secret@db.demo.supabase.co:5432/postgres',
        { DB_PROVIDER: 'supabase' } as NodeJS.ProcessEnv,
      );

      assert.strictEqual(options.ssl, 'require');
    });

    it('disables prepared statements for the Supabase pooler', () => {
      const options = resolvePostgresConnectionOptions(
        'postgresql://postgres:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
        { DB_PROVIDER: 'supabase' } as NodeJS.ProcessEnv,
      );

      assert.strictEqual(options.prepare, false);
    });
  });

  describe('openDatabase()', () => {
    it('throws when DATABASE_URL is empty', () => {
      assert.throws(() => {
        openDatabase('');
      }, /DATABASE_URL is required/);
    });

    it('creates sql instance with valid url', () => {
      const dbUrl = 'postgres://ds:local@localhost:5432/ds_dashboard';
      const sql = openDatabase(dbUrl);
      assert.ok(sql);
      sql.end();
    });
  });

  describe('runMigrations() with skipChecksumValidation', () => {
    it('skips checksum validation when skipChecksumValidation is true', async () => {
      const sql = openDatabase(
        'postgres://ds:local@localhost:5432/ds_dashboard',
      );
      try {
        const fakeMigration: MigrationEntry = {
          version: 9999,
          sql: 'SELECT 1;',
        };
        await assert.doesNotReject(async () => {
          await runMigrations(sql, [fakeMigration], {
            skipChecksumValidation: true,
          });
        });
      } finally {
        await sql`DELETE FROM schema_migrations WHERE version = 9999`;
        await sql.end();
      }
    });

    it('validates checksum by default', async () => {
      const sql = openDatabase(
        'postgres://ds:local@localhost:5432/ds_dashboard',
      );
      try {
        await sql`DELETE FROM schema_migrations WHERE version = 3`;
        const fakeMigration: MigrationEntry = { version: 3, sql: 'SELECT 2;' };
        await assert.rejects(async () => {
          await runMigrations(sql, [fakeMigration], {
            skipChecksumValidation: false,
          });
        }, /checksum mismatch/);
      } finally {
        await sql`DELETE FROM schema_migrations WHERE version = 3`;
        await sql.end();
      }
    });
  });
});
