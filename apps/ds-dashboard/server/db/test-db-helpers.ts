import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DB_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.join(DB_DIR, 'schema.sql');

export function createInMemoryDbFromSchema(options?: {
  designSystems?: Array<{ id: string; name: string }>;
}): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));

  const systems = options?.designSystems ?? [];
  if (systems.length > 0) {
    const insert = db.prepare('INSERT INTO design_systems (id, name) VALUES (?, ?)');
    for (const system of systems) {
      insert.run(system.id, system.name);
    }
  }

  return db;
}
