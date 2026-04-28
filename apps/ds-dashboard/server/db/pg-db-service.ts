/**
 * PostgreSQL DB Service
 *
 * Core database module for PostgreSQL operations.
 * Uses postgres.js driver with connection pooling and runs idempotent migrations.
 */

import postgres, { type Sql } from 'postgres';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MIGRATION_CHECKSUMS: Record<number, string> = {
  1: '5bf101c991868049fa13e17a073e4be8e856c881290f0b71ca18e3cc151446df',
  2: '6ce1e52ba6cf0f1d54e45989824d790677fd275f983db42ccfb77096948b34ac',
  3: 'de27aa6db1415532c5ac5b1d119f403217d6b5856cddb052f362b06e0792668c',
  4: '6e7ab75f6021d5002056b742420e46d6863059b2ce812e78974e150ec5ba674f',
  5: 'a9859ecb4fecf8bb9dd4e167f4f1d5455633184dbe2005e93ecefa7f7ded25b0',
  6: '4867385d379dc3390b0d37a8333d7b12bd3f5fbfa73bceddc9f556b141fd4a13',
  7: '83f5e6fc4645a54118dccefbfb5a6df0e388224f2199ccdb99137afb6062b277',
  9: '6125698b681ccd7648020ac6090c0a2a3dad72813923da716075205b6342bafe',
  10: 'd896b7b995de2317d57fb927ee683e564ba34624f8e6a270c454112629b9bb25',
  13: '7f85dd1488569ddb6ab12a92817d53b2ab0a74ccb77a75a37c9204fb36cebee6',
  15: '3c9a7c5732803016cb038fd3ed38bcce829c956182f7971f360054348b307adb',
  16: 'a6b646ee58eaffaeb3175316ce72eb8439e5e1561a1257c6e88b39b846be1153',
  17: '72778134a71578de1f4931a1034790d433f480a19b39106af170caef6f33d2df',
  18: '5ae39cd2f52e6b8c97f9b157069cfb57932c75e2df1ddd7a6337b6078d4d303e',
  19: '9a214afca5ed621909bf1bbfe561754565119cfc2df74fdc08d6c990db357774',
  20: '223283df43a31702bd3d2f2b34740e6444548085e86c0a7bd1821899161ae4fe',
  21: '9d40951591fca7f14ddca5bf0c8da80521aded26d2801f04a1c8c019f100387b',
  22: '116f51bc23f7fc30162547acb7bf8e87ad7f988d39cb83afe552833e3272f18c',
  23: 'f49278e16fd4613469b1da175c6f2288ce97c6cd8b9dd90a0fbc4fec9ea61e7a',
  24: 'a624bfcdb0a5f1b1b44a1b12f017e4278e49188cd32c0d491ea93c640ee0b487',
  26: '71d8e15bfbaeb2cabbbe8ddafaeafbe740a8ed5f3018d3463754c9988711be8a',
  27: '22aadf597f1be39bc57023ae8aa135c5cf96775df810a3e88995a3d4b93723c7',
  28: '4cb3bc7fabd0d452e190935525f2608907d49cf3e976ddaf9319786babc673b0',
  29: 'f7ccceec8eb3d0391aff946331837e81b0e68c6f94b765c01a7d3382587da995',
  30: '3d385998fe8d44fe150313d35784507e7d65e5c2f354f28be840972b9a5a8289',
  31: '652ecae4713c38a9b3fdc9a0767377c396b6033450ce905fc60af2c6007de2da',
  32: '0535ebfb4eb1edcd3e162ae4a4f72cdd5acec914675e5390dd74c6c18bc789bb',
  33: '6801b7f7215c5096ffa797d9f1c3e296be95ea19ba8374b4676f6ee4024d63d5',
  34: '45336ba8bfb6439825107ece3209005825499a4fe4c7d604fda18092e3f66ef7',
  35: '6e65e452d4bf34bc2e708f2569fe32cb258caf83a56d5a1118067e7a06143fe5',
  36: '49c04e8145935ace126e46f21dd92f8a38234718718443b452de71769e1f43b3',
  37: 'd9036f1fd4757f34d3c7b3c57150ff7637299f93eed10994cad3b5f51aefa44b',
  42: '1719b05411740c26c6a5fb1d384557032203b7107e0a054ea3462cf30ae66da7',
  43: '299daf962a4e3f3162699fe97a2c69ecbdfddcc40e92dd35ce90a3ec47bf1074',
  44: 'd9e23f29138cd31d664192f9fdced8a33e59f0af8fdc2a1bb3334539369deabd',
  45: 'eb800569e5e29c78f7ab1df2024c4ed296ad0ebc444c65b72f6897c4ad1553e8',
};

import * as crypto from 'node:crypto';

function validateMigrationChecksum(
  version: number,
  sql: string,
  skipValidation: boolean = false,
): void {
  // Allow skipping checksums via parameter or environment variable
  if (skipValidation || process.env.SKIP_MIGRATION_CHECKSUMS === 'true') {
    console.warn(
      `[pg-db-service] Skipping checksum validation for migration ${version}`,
    );
    return;
  }

  const expectedChecksum = MIGRATION_CHECKSUMS[version];
  if (!expectedChecksum) {
    console.warn(
      `[pg-db-service] Migration ${version} has no configured checksum - skipping validation`,
    );
    return;
  }
  const actualChecksum = crypto.createHash('sha256').update(sql).digest('hex');
  if (actualChecksum !== expectedChecksum) {
    throw new Error(
      `Migration ${version} checksum mismatch. Expected ${expectedChecksum}, got ${actualChecksum}. ` +
        `Migration file may have been tampered with.`,
    );
  }
}

export interface MigrationEntry {
  version: number;
  sql: string;
}

export interface DbServiceOptions {
  databaseUrl: string;
}

export interface TestDatabaseResult {
  sql: Sql;
  cleanup: () => Promise<void>;
}

export interface PostgresDbOptions {
  max?: number;
  idle_timeout?: number;
  connect_timeout?: number;
  prepare?: boolean;
  ssl?: boolean | 'require';
}

export type DatabaseProvider = 'local' | 'supabase' | 'custom';

export const DEFAULT_LOCAL_DATABASE_URL =
  'postgres://ds:local@localhost:5432/ds_dashboard';

function normalizeDatabaseProvider(value: unknown): DatabaseProvider | null {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (
    normalized === 'local' ||
    normalized === 'supabase' ||
    normalized === 'custom'
  ) {
    return normalized;
  }
  return null;
}

function inferDatabaseProvider(databaseUrl: string): DatabaseProvider {
  try {
    const parsed = new URL(databaseUrl);
    const host = parsed.hostname.toLowerCase();
    if (host.includes('supabase.co') || host.includes('supabase.com')) {
      return 'supabase';
    }
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === ''
    ) {
      return 'local';
    }
  } catch {
    // Invalid URLs are handled by postgres.js when a connection is attempted.
  }
  return 'custom';
}

export function resolveDatabaseProvider(
  env: NodeJS.ProcessEnv = process.env,
): DatabaseProvider {
  const configured = normalizeDatabaseProvider(env.DB_PROVIDER);
  if (configured) return configured;
  const dbUrl = String(
    env.DATABASE_URL || env.SUPABASE_DATABASE_URL || '',
  ).trim();
  if (!dbUrl) return 'local';
  return inferDatabaseProvider(dbUrl);
}

export function resolvePostgresConnectionOptions(
  databaseUrl: string,
  env: NodeJS.ProcessEnv = process.env,
): PostgresDbOptions {
  const provider = resolveDatabaseProvider(env);
  const explicitPrepare = String(env.DB_PREPARE_STATEMENTS || '')
    .trim()
    .toLowerCase();
  const explicitSsl = String(env.DB_SSL || '')
    .trim()
    .toLowerCase();
  let host = '';
  let port = '';
  let sslMode = '';
  try {
    const parsed = new URL(databaseUrl);
    host = parsed.hostname.toLowerCase();
    port = parsed.port;
    sslMode = String(parsed.searchParams.get('sslmode') || '').toLowerCase();
  } catch {
    // Leave optional connection tuning at defaults for malformed URLs.
  }

  const isSupabasePooler =
    provider === 'supabase' &&
    (host.includes('pooler.supabase') || port === '6543');
  const shouldRequireSsl =
    explicitSsl === 'require' ||
    explicitSsl === 'true' ||
    sslMode === 'require' ||
    provider === 'supabase';
  const shouldPrepare =
    explicitPrepare === 'false' || explicitPrepare === '0'
      ? false
      : isSupabasePooler
        ? false
        : undefined;

  return {
    ...(shouldPrepare !== undefined ? { prepare: shouldPrepare } : {}),
    ...(shouldRequireSsl ? { ssl: 'require' as const } : {}),
  };
}

/**
 * Open a PostgreSQL database connection
 *
 * @param databaseUrl - PostgreSQL connection string
 * @param options - Connection pool options
 * @returns Sql instance for querying
 * @throws If database connection fails
 */
export function openDatabase(
  databaseUrl: string,
  options?: PostgresDbOptions,
): Sql {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  return postgres(databaseUrl, {
    max: options?.max ?? 10,
    idle_timeout: options?.idle_timeout ?? 30,
    connect_timeout: options?.connect_timeout ?? 10,
    ...(options?.prepare !== undefined ? { prepare: options.prepare } : {}),
    ...(options?.ssl !== undefined ? { ssl: options.ssl } : {}),
  });
}

/**
 * Run pending migrations in a transaction
 *
 * @param sql - Open Sql instance
 * @param migrations - Array of migration entries sorted by version
 * @param options - Optional configuration (e.g., skipChecksumValidation for dev/testing)
 * @throws If any migration fails (transaction rolls back)
 */
export async function runMigrations(
  sql: Sql,
  migrations: MigrationEntry[],
  options?: { skipChecksumValidation?: boolean },
): Promise<void> {
  if (migrations.length === 0) {
    return;
  }

  await sql`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version    INTEGER PRIMARY KEY,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    `;

  const appliedResult = await sql`
        SELECT version FROM schema_migrations ORDER BY version
    `;
  const appliedVersions = new Set<number>(appliedResult.map((r) => r.version));

  const pending = migrations.filter((m) => !appliedVersions.has(m.version));

  if (pending.length === 0) {
    return;
  }

  for (const migration of pending) {
    try {
      validateMigrationChecksum(
        migration.version,
        migration.sql,
        options?.skipChecksumValidation,
      );
      await sql.begin(async (tx) => {
        await tx.unsafe(migration.sql);
        await tx`
                    INSERT INTO schema_migrations (version) VALUES (${migration.version})
                `;
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Migration ${migration.version} failed: ${errorMessage}`);
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
 * Bootstrap database: connect and run all pending migrations
 *
 * Convenience function that combines openDatabase and runMigrations.
 *
 * @param databaseUrl - PostgreSQL connection string
 * @returns Configured Sql instance with migrations applied
 * @throws If database connection or migrations fail
 */
export async function bootstrapDatabase(
  databaseUrl: string,
  options?: PostgresDbOptions,
): Promise<Sql> {
  const sql = openDatabase(databaseUrl, {
    ...resolvePostgresConnectionOptions(databaseUrl),
    ...options,
  });

  const migrationsDir = path.join(__dirname, 'migrations-pg');
  const migrations = loadMigrationsFromDir(migrationsDir);

  await runMigrations(sql, migrations);
  await ensureEmbeddingDimensions(sql);

  return sql;
}

/**
 * Close database connection
 *
 * @param sql - Sql instance to close
 */
export async function closeDatabase(sql: Sql): Promise<void> {
  await sql.end();
}

/**
 * Resolve database URL from environment
 *
 * Priority:
 * 1. `TEST_DATABASE_URL` when present.
 * 2. `SUPABASE_DATABASE_URL` when DB_PROVIDER=supabase.
 * 3. `DATABASE_URL` when present.
 * 4. Local fallback database URL used by the dashboard/dev supervisor.
 *
 * In production, missing database configuration is treated as an error so we
 * do not silently connect to the local fallback database.
 */
export function resolveDashboardDbUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const testDbUrl = String(env.TEST_DATABASE_URL || '').trim();
  const dbUrl = String(env.DATABASE_URL || '').trim();
  const supabaseDbUrl = String(env.SUPABASE_DATABASE_URL || '').trim();
  const provider = resolveDatabaseProvider(env);
  const preferTestUrl = String(env.NODE_ENV || '').trim() === 'test';
  if (testDbUrl) {
    return testDbUrl;
  }
  if (provider === 'supabase' && supabaseDbUrl) {
    return supabaseDbUrl;
  }
  if (dbUrl) {
    return dbUrl;
  }
  if (preferTestUrl) {
    return DEFAULT_LOCAL_DATABASE_URL;
  }
  if (String(env.NODE_ENV || '').trim() === 'production') {
    throw new Error(
      'Database configuration is required in production. ' +
        'Set DATABASE_URL, SUPABASE_DATABASE_URL, or TEST_DATABASE_URL before starting the dashboard.',
    );
  }
  if (provider === 'supabase') {
    throw new Error(
      'SUPABASE_DATABASE_URL or DATABASE_URL is required when DB_PROVIDER=supabase.',
    );
  }
  return DEFAULT_LOCAL_DATABASE_URL;
}

async function ensureEmbeddingDimensions(sql: Sql): Promise<void> {
  const envDims = parseInt(process.env.EMBEDDING_DIMENSIONS ?? '1536', 10);
  if (!Number.isFinite(envDims) || envDims <= 0) {
    throw new Error(
      `Invalid EMBEDDING_DIMENSIONS=${String(process.env.EMBEDDING_DIMENSIONS)}. ` +
        'It must be a positive integer.',
    );
  }

  const [{ regclass }] = (await sql`
    SELECT to_regclass('document_chunks') AS regclass
  `) as Array<{ regclass: string | null }>;
  if (!regclass) {
    return;
  }

  const rows = (await sql`
    SELECT atttypmod, format_type(atttypid, atttypmod) AS type_sql
    FROM pg_attribute
    WHERE attrelid = 'document_chunks'::regclass
      AND attname = 'embedding'
  `) as Array<{ atttypmod: number; type_sql: string | null }>;
  if (rows.length === 0) {
    return;
  }

  const typeSql = String(rows[0].type_sql || '');
  const parsedDims = /vector\((\d+)\)/i.exec(typeSql)?.[1];
  const schemaDims =
    (parsedDims ? parseInt(parsedDims, 10) : NaN) ||
    Number(rows[0].atttypmod) - 4 ||
    Number(rows[0].atttypmod);
  if (!Number.isFinite(schemaDims) || schemaDims <= 0) {
    return;
  }
  if (schemaDims !== envDims) {
    throw new Error(
      `EMBEDDING_DIMENSIONS=${envDims} but schema has vector(${schemaDims}). ` +
        'Run TRUNCATE document_chunks and set EMBEDDING_DIMENSIONS to match.',
    );
  }
}
