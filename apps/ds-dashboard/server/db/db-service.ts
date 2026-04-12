/**
 * DB Service
 *
 * Core database module for SQLite operations.
 * Opens DB with WAL/NORMAL/busy_timeout pragmas and runs idempotent migrations.
 */

import Database from 'better-sqlite3';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Options for opening a database
 */
export interface DbServiceOptions {
    dbPath: string;
}

/**
 * Migration entry loaded from filesystem
 */
export interface MigrationEntry {
    version: number;
    sql: string;
}

function hasColumn(db: Database.Database, tableName: string, columnName: string): boolean {
    const rows = db
        .prepare(`PRAGMA table_info(${tableName})`)
        .all() as Array<{ name: string }>;
    return rows.some((row) => row.name === columnName);
}

function hasTable(db: Database.Database, tableName: string): boolean {
    const row = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get(tableName) as { name: string } | undefined;
    return Boolean(row?.name);
}

function shouldSkipMigration(db: Database.Database, migration: MigrationEntry): boolean {
    // Migration 032 adds behaviour_json to component_editorial.
    // In hybrid init/migrate environments this column may already exist.
    if (migration.version === 32) {
        return hasColumn(db, 'component_editorial', 'behaviour_json');
    }
    // Migration 034 drops properties_json and creates component_figma_props.
    // In schema-initialized or partially-upgraded DBs this end-state may already exist.
    if (migration.version === 34) {
        // Skip only when both conditions are true: column already removed and props table exists.
        return !hasColumn(db, 'component_editorial', 'properties_json')
            && hasTable(db, 'component_figma_props');
    }
    return false;
}

/**
 * Ensure schema_migrations table exists
 */
function ensureSchemaMigrationsTable(db: Database.Database): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version    INTEGER PRIMARY KEY,
            applied_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
        )
    `);
}

/**
 * Open a SQLite database with production pragmas
 *
 * @param options - Database options including path
 * @returns Configured Database instance
 * @throws If database cannot be opened or created
 */
export function openDatabase(options: DbServiceOptions): Database.Database {
    // Validate parent directory exists
    const parentDir = path.dirname(options.dbPath);
    if (!fsSync.existsSync(parentDir)) {
        throw new Error(`Database parent directory does not exist: ${parentDir}`);
    }

    // Open database
    const db = new Database(options.dbPath);

    // Apply production pragmas
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('busy_timeout = 5000');
    db.pragma('foreign_keys = ON');

    // Create migrations tracking table
    ensureSchemaMigrationsTable(db);

    return db;
}

/**
 * Run pending migrations in a transaction
 *
 * @param db - Open database instance
 * @param migrations - Array of migration entries sorted by version
 * @throws If any migration fails (transaction rolls back)
 */
export function runMigrations(
    db: Database.Database,
    migrations: MigrationEntry[]
): void {
    if (migrations.length === 0) {
        return;
    }

    // Get already applied migrations
    const appliedStmt = db.prepare('SELECT version FROM schema_migrations ORDER BY version');
    const appliedVersions = new Set<number>(
        (appliedStmt.all() as Array<{ version: number }>).map((r) => r.version)
    );

    // Filter pending migrations
    const pending = migrations.filter((m) => !appliedVersions.has(m.version));

    if (pending.length === 0) {
        return;
    }

    // Run each pending migration in a transaction
    const insertStmt = db.prepare(
        'INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, strftime(\'%s\', \'now\'))'
    );

    for (const migration of pending) {
        const tx = db.transaction(() => {
            if (shouldSkipMigration(db, migration)) {
                insertStmt.run(migration.version);
                return;
            }

            // Execute migration SQL
            db.exec(migration.sql);

            // Record migration as applied
            insertStmt.run(migration.version);
        });

        try {
            tx();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(
                `Migration ${migration.version} failed: ${errorMessage}`
            );
        }
    }
}

/**
 * Load migrations from a directory
 *
 * Reads files matching pattern NNN_*.sql where NNN is a 3-digit version number.
 * Files are sorted by version number ascending.
 *
 * @param dirPath - Path to migrations directory
 * @returns Array of migration entries sorted by version
 * @throws If directory doesn't exist or files cannot be read
 */
export function loadMigrationsFromDir(dirPath: string): MigrationEntry[] {
    if (!fsSync.existsSync(dirPath)) {
        throw new Error(`Migrations directory does not exist: ${dirPath}`);
    }

    const stats = fsSync.statSync(dirPath);
    if (!stats.isDirectory()) {
        throw new Error(`Migrations path is not a directory: ${dirPath}`);
    }

    const files = fsSync
        .readdirSync(dirPath, { encoding: 'utf8' })
        .filter((f) => /^\d{3}_.*\.sql$/.test(f))
        .sort();

    return files.map((f) => ({
        version: parseInt(f.slice(0, 3), 10),
        sql: fsSync.readFileSync(path.join(dirPath, f), 'utf8'),
    }));
}

/**
 * Bootstrap database: open and run all pending migrations
 *
 * Convenience function that combines openDatabase and runMigrations.
 *
 * @param options - Database options including path
 * @returns Configured Database instance with migrations applied
 * @throws If database cannot be opened or migrations fail
 */
export function bootstrapDatabase(options: DbServiceOptions): Database.Database {
    const db = openDatabase(options);

    const migrationsDir = path.join(__dirname, 'migrations');
    const migrations = loadMigrationsFromDir(migrationsDir);

    runMigrations(db, migrations);

    return db;
}
