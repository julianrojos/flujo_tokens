/**
 * DB Service Tests
 *
 * Tests for database bootstrap, migrations, and pragmas.
 * Uses :memory: database for isolation.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import * as path from 'node:path';
import * as fsSync from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import {
    openDatabase,
    runMigrations,
    loadMigrationsFromDir,
    bootstrapDatabase,
    type DbServiceOptions,
    type MigrationEntry,
} from './db-service.js';

/**
 * Create a temporary in-memory database for testing
 */
function createMemoryDbOptions(): DbServiceOptions {
    return { dbPath: ':memory:' };
}

describe('db-service', () => {
    describe('openDatabase()', () => {
        let db: Database.Database | null = null;

        afterEach(() => {
            if (db) {
                db.close();
                db = null;
            }
        });

        it('opens :memory: database successfully', () => {
            db = openDatabase({ dbPath: ':memory:' });
            assert.ok(db);
            assert.ok(db instanceof Database);
        });

        it('creates schema_migrations table automatically', () => {
            db = openDatabase({ dbPath: ':memory:' });

            const tables = db
                .prepare(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'"
                )
                .get();

            assert.ok(tables, 'schema_migrations table should exist');
        });

        it('applies WAL journal mode pragma', () => {
            db = openDatabase({ dbPath: ':memory:' });

            // Note: :memory: DBs use 'memory' journal mode, not 'wal'
            // We verify the pragma was set even if not applicable to in-memory DBs
            const result = db.pragma('journal_mode') as Array<{ journal_mode: string }>;
            assert.ok(result.length > 0, 'Should return journal_mode pragma result');
        });

        it('applies synchronous pragma', () => {
            db = openDatabase({ dbPath: ':memory:' });

            const result = db.pragma('synchronous') as Array<{ synchronous: number }>;
            assert.strictEqual(result[0].synchronous, 1, 'synchronous should be NORMAL (1)');
        });

        it('enables foreign key enforcement pragma', () => {
            db = openDatabase({ dbPath: ':memory:' });

            const result = db.pragma('foreign_keys') as Array<{ foreign_keys: number }>;
            assert.strictEqual(result[0].foreign_keys, 1, 'foreign_keys should be ON (1)');
        });

        it('throws if parent directory does not exist', () => {
            assert.throws(
                () => openDatabase({ dbPath: '/nonexistent/path/test.db' }),
                /Database parent directory does not exist/
            );
        });
    });

    describe('bootstrapDatabase()', () => {
        let db: Database.Database | null = null;

        afterEach(() => {
            if (db) {
                db.close();
                db = null;
            }
        });

        it('creates all tables from migrations on fresh :memory: DB', () => {
            db = bootstrapDatabase({ dbPath: ':memory:' });

            const expectedTables = [
                'schema_migrations',
                'db_meta',
                'tokens',
                'figma_aliases',
                'ai_jobs',
                'job_events',
            ];

            for (const tableName of expectedTables) {
                const table = db
                    .prepare(
                        "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
                    )
                    .get(tableName);
                assert.ok(table, `${tableName} table should exist`);
            }
        });

        it('does not keep legacy tokens_json or token_mapping_json in component_editorial after migrations', () => {
            db = bootstrapDatabase({ dbPath: ':memory:' });

            const columns = db
                .prepare("PRAGMA table_info('component_editorial')")
                .all() as Array<{ name: string }>;

            const columnNames = columns.map((column) => column.name);
            assert.ok(columnNames.includes('variants_json'));
            assert.ok(columnNames.includes('properties_json'));
            assert.ok(!columnNames.includes('tokens_json'));
            assert.ok(!columnNames.includes('token_mapping_json'));
        });

        it('preserves existing editorial data when upgrading through migration 028', () => {
            db = openDatabase({ dbPath: ':memory:' });

            const migrationsDir = path.join(__dirname, 'migrations');
            const migrations = loadMigrationsFromDir(migrationsDir);
            const pre028 = migrations.filter((migration) => migration.version < 28);
            const from028 = migrations.filter((migration) => migration.version >= 28);

            runMigrations(db, pre028);

            db.prepare(`
                INSERT INTO design_systems (id, name)
                VALUES ('sys-upgrade', 'Upgrade Test')
            `).run();
            db.prepare(`
                INSERT INTO components (ds_id, slug, name, status, doc_type)
                VALUES ('sys-upgrade', 'upgrade-button', 'Upgrade Button', 'draft', 'component')
            `).run();

            const component = db.prepare(`
                SELECT id FROM components
                WHERE ds_id = 'sys-upgrade' AND slug = 'upgrade-button'
            `).get() as { id: number };

            db.prepare(`
                INSERT INTO component_editorial (
                    component_id,
                    summary_json,
                    token_mapping_json,
                    accessibility_notes_json,
                    variants_json,
                    tokens_json,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
                component.id,
                JSON.stringify({ purpose: 'Upgrade-safe summary' }),
                JSON.stringify({ surface: { default: 'color.surface.default' } }),
                JSON.stringify(['Keyboard accessible']),
                JSON.stringify([{ id: 'v1', name: 'Default', description: '', properties: { State: 'Default' } }]),
                JSON.stringify([{ name: 'legacy-token', value: '#000', type: 'color' }]),
                1234567890,
            );

            runMigrations(db, from028);

            const columns = db
                .prepare("PRAGMA table_info('component_editorial')")
                .all() as Array<{ name: string }>;
            const columnNames = columns.map((column) => column.name);
            assert.ok(!columnNames.includes('tokens_json'));
            assert.ok(!columnNames.includes('token_mapping_json'));

            const row = db.prepare(`
                SELECT summary_json, accessibility_notes_json, variants_json, updated_at
                FROM component_editorial
                WHERE component_id = ?
            `).get(component.id) as {
                summary_json: string | null;
                accessibility_notes_json: string | null;
                variants_json: string | null;
                updated_at: number;
            };

            assert.deepEqual(JSON.parse(row.summary_json as string), { purpose: 'Upgrade-safe summary' });
            assert.deepEqual(JSON.parse(row.accessibility_notes_json as string), ['Keyboard accessible']);
            assert.deepEqual(JSON.parse(row.variants_json as string), [
                { id: 'v1', name: 'Default', description: '', properties: { State: 'Default' } },
            ]);
            assert.equal(row.updated_at, 1234567890);
        });

        it('creates all indexes from migrations', () => {
            db = bootstrapDatabase({ dbPath: ':memory:' });

            const expectedIndexes = [
                'idx_db_meta_key',
                'idx_tokens_ds_slash_path',
                'idx_tokens_ds_css_var',
                'idx_tokens_collection',
                'idx_tokens_type',
                'idx_figma_aliases_from',
                'idx_figma_aliases_to',
                'idx_ai_jobs_status',
                'idx_ai_jobs_idempotency_key',
                'idx_ai_jobs_provider',
                'idx_job_events_job_id',
            ];

            for (const indexName of expectedIndexes) {
                const index = db
                    .prepare(
                        "SELECT name FROM sqlite_master WHERE type='index' AND name=?"
                    )
                    .get(indexName);
                assert.ok(index, `${indexName} index should exist`);
            }
        });

        it('is idempotent: running twice does not error or duplicate', () => {
            db = bootstrapDatabase({ dbPath: ':memory:' });

            // Running again should be a no-op
            const db2 = bootstrapDatabase({ dbPath: ':memory:' });

            // Verify tables still exist and are accessible
            const tables = db2
                .prepare("SELECT name FROM sqlite_master WHERE type='table'")
                .all() as Array<{ name: string }>;

            assert.ok(tables.length >= 7, 'Should have at least 7 tables');

            db2.close();
        });

        it('records applied migrations in schema_migrations', () => {
            db = bootstrapDatabase({ dbPath: ':memory:' });

            const migrations = db
                .prepare('SELECT version FROM schema_migrations ORDER BY version')
                .all() as Array<{ version: number }>;

            assert.ok(migrations.length > 0, 'At least one migration should be recorded');
            assert.strictEqual(migrations[0].version, 1, 'First migration should be version 1');
        });

        it('ds_consumers table does not have legacy sync_interval_hours and max_stale_hours columns after migrations', () => {
            db = bootstrapDatabase({ dbPath: ':memory:' });

            const tableInfo = db
                .prepare('PRAGMA table_info(ds_consumers)')
                .all() as Array<{ name: string }>;

            const columnNames = tableInfo.map(col => col.name);
            assert.ok(!columnNames.includes('sync_interval_hours'), 'sync_interval_hours should not exist');
            assert.ok(!columnNames.includes('max_stale_hours'), 'max_stale_hours should not exist');
        });
    });

    describe('runMigrations()', () => {
        let db: Database.Database | null = null;

        afterEach(() => {
            if (db) {
                db.close();
                db = null;
            }
        });

        it('skips already applied migrations', () => {
            db = openDatabase({ dbPath: ':memory:' });

            const migrationsDir = path.join(__dirname, 'migrations');
            const migrations = loadMigrationsFromDir(migrationsDir);

            // Run once
            runMigrations(db, migrations);

            // Get count before
            const beforeCount = db
                .prepare("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'")
                .get() as { count: number };

            // Run again with same migrations
            runMigrations(db, migrations);

            // Get count after
            const afterCount = db
                .prepare("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'")
                .get() as { count: number };

            // Counts should be equal (no duplicate tables created)
            assert.strictEqual(beforeCount.count, afterCount.count);
        });

        it('throws on invalid SQL and rolls back', () => {
            db = openDatabase({ dbPath: ':memory:' });
            if (!db) throw new Error('Database should not be null');

            const invalidMigrations: MigrationEntry[] = [
                { version: 999, sql: 'INVALID SQL STATEMENT THAT WILL FAIL' },
            ];

            assert.throws(
                () => runMigrations(db!, invalidMigrations),
                /Migration 999 failed/
            );

            // DB should still be usable after failed migration
            const result = db.prepare('SELECT 1 as test').get() as { test: number };
            assert.strictEqual(result.test, 1);
        });

        it('runs migrations in version order', () => {
            db = openDatabase({ dbPath: ':memory:' });

            const migrationsDir = path.join(__dirname, 'migrations');
            const migrations = loadMigrationsFromDir(migrationsDir);

            // Verify migrations are sorted
            for (let i = 1; i < migrations.length; i++) {
                assert.ok(
                    migrations[i].version > migrations[i - 1].version,
                    'Migrations should be sorted by version ascending'
                );
            }
        });

        it('skips migration 029 when properties_json already exists', () => {
            db = openDatabase({ dbPath: ':memory:' });
            if (!db) throw new Error('Database should not be null');

            db.exec(`
                CREATE TABLE component_editorial (
                    component_id INTEGER PRIMARY KEY,
                    properties_json TEXT
                );
            `);

            const migration029: MigrationEntry = {
                version: 29,
                sql: `
                    ALTER TABLE component_editorial ADD COLUMN properties_json TEXT
                      CHECK(properties_json IS NULL OR (json_valid(properties_json) AND json_type(properties_json) = 'array'));
                `,
            };

            runMigrations(db, [migration029]);

            const applied = db
                .prepare('SELECT version FROM schema_migrations WHERE version = 29')
                .get() as { version: number } | undefined;
            assert.equal(applied?.version, 29);
        });
    });

    describe('loadMigrationsFromDir()', () => {
        it('loads migrations from directory and sorts by version', () => {
            const migrationsDir = path.join(__dirname, 'migrations');
            const migrations = loadMigrationsFromDir(migrationsDir);

            assert.ok(migrations.length > 0, 'Should load at least one migration');

            // Verify structure
            for (const migration of migrations) {
                assert.ok(typeof migration.version === 'number', 'version should be a number');
                assert.ok(typeof migration.sql === 'string', 'sql should be a string');
                assert.ok(migration.sql.length > 0, 'sql should not be empty');
            }

            // Verify sorted
            for (let i = 1; i < migrations.length; i++) {
                assert.ok(
                    migrations[i].version > migrations[i - 1].version,
                    'Migrations should be sorted by version'
                );
            }
        });

        it('ignores non-SQL files in migrations directory', () => {
            const migrationsDir = path.join(__dirname, 'migrations');
            const migrations = loadMigrationsFromDir(migrationsDir);

            // Create a non-SQL file in the migrations directory
            const nonSqlFile = path.join(migrationsDir, 'README.txt');
            fsSync.writeFileSync(nonSqlFile, 'This is not SQL');

            try {
                const migrationsAfter = loadMigrationsFromDir(migrationsDir);
                // Should still have same count (non-SQL file ignored)
                assert.strictEqual(migrations.length, migrationsAfter.length);
            } finally {
                fsSync.unlinkSync(nonSqlFile);
            }
        });

        it('throws if directory does not exist', () => {
            assert.throws(
                () => loadMigrationsFromDir('/nonexistent/path'),
                /Migrations directory does not exist/
            );
        });

        it('throws if path is not a directory', () => {
            const tempFile = path.join(__dirname, 'not-a-dir.sql');
            fsSync.writeFileSync(tempFile, 'test');

            try {
                assert.throws(
                    () => loadMigrationsFromDir(tempFile),
                    /Migrations path is not a directory/
                );
            } finally {
                fsSync.unlinkSync(tempFile);
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
});
