import postgres, { type Sql } from 'postgres';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadMigrationsFromDir, runMigrations } from './pg-db-service.js';

const DB_DIR = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(DB_DIR, 'migrations-pg');

function generateTestSchemaName(): string {
  return `test_${randomBytes(6).toString('hex')}`;
}

export interface TestDbResult {
  sql: Sql;
  schemaName: string;
  cleanup: () => Promise<void>;
}

export async function createTestDatabase(options?: {
  databaseUrl?: string;
  designSystems?: Array<{ id: string; name: string }>;
}): Promise<TestDbResult> {
  const databaseUrl =
    options?.databaseUrl ??
    process.env.TEST_DATABASE_URL ??
    process.env.DATABASE_URL ??
    'postgres://ds:local@localhost:5432/ds_dashboard';

  const schemaName = generateTestSchemaName();
  const adminSql = postgres(databaseUrl, {
    max: 2,
    onnotice: () => {},
  });

  try {
    await adminSql`CREATE SCHEMA ${adminSql(schemaName)}`;

    const scopedUrl = new URL(databaseUrl);
    scopedUrl.searchParams.set('search_path', `${schemaName},public`);
    const sql = postgres(scopedUrl.toString(), {
      max: 10,
      onnotice: () => {},
    });
    const migrations = loadMigrationsFromDir(MIGRATIONS_DIR);
    await runMigrations(sql, migrations);

    const insertSystems = options?.designSystems ?? [];
    if (insertSystems.length > 0) {
      for (const system of insertSystems) {
        await sql`
          INSERT INTO design_systems (id, name)
          VALUES (${system.id}, ${system.name})
        `;
      }
    }

    const cleanup = async (): Promise<void> => {
      await sql.end();
      await adminSql`DROP SCHEMA ${adminSql(schemaName)} CASCADE`;
      await adminSql.end();
    };

    return {
      sql,
      schemaName,
      cleanup,
    };
  } catch (error) {
    await adminSql.end();
    throw error;
  }
}
