import type { Sql } from 'postgres';

type BulkInsertRow = readonly unknown[];

export interface BulkInsertOptions {
  table: string;
  columns: readonly string[];
  rows: readonly BulkInsertRow[];
  onConflict?: string;
  chunkSize?: number;
}

function assertSafeSqlIdentifier(label: string, value: string): void {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(`bulkInsert received an unsafe ${label}: ${value}`);
  }
}

function validateOnConflictClause(clause: string): void {
  if (!/^ON CONFLICT\s+/i.test(clause)) {
    throw new Error('bulkInsert onConflict must start with "ON CONFLICT".');
  }
  if (/[;]|--|\/\*/.test(clause)) {
    throw new Error('bulkInsert onConflict contains unsafe SQL punctuation.');
  }
}

function buildBulkInsertStatement(options: {
  table: string;
  columns: readonly string[];
  rows: readonly BulkInsertRow[];
  onConflict?: string;
}): { text: string; values: unknown[] } {
  assertSafeSqlIdentifier('table', options.table);
  for (const column of options.columns) {
    assertSafeSqlIdentifier('column', column);
  }
  if (options.onConflict) {
    validateOnConflictClause(options.onConflict);
  }

  const values: unknown[] = [];
  const tuples: string[] = [];

  for (const row of options.rows) {
    const startIndex = values.length + 1;
    const placeholders: string[] = [];
    for (let index = 0; index < row.length; index += 1) {
      placeholders.push(`$${startIndex + index}`);
      values.push(row[index]);
    }
    tuples.push(`(${placeholders.join(', ')})`);
  }

  const conflictClause = options.onConflict ? ` ${options.onConflict}` : '';
  const text = `INSERT INTO ${options.table} (${options.columns.join(', ')}) VALUES ${tuples.join(', ')}${conflictClause}`;
  return { text, values };
}

export async function bulkInsert(sql: Sql, options: BulkInsertOptions): Promise<number> {
  const chunkSize = Math.max(1, Math.floor(options.chunkSize || 1000));
  let insertedCount = 0;

  for (let offset = 0; offset < options.rows.length; offset += chunkSize) {
    const chunk = options.rows.slice(offset, offset + chunkSize);
    if (chunk.length === 0) continue;
    const statement = buildBulkInsertStatement({
      table: options.table,
      columns: options.columns,
      rows: chunk,
      onConflict: options.onConflict,
    });
    const result = await sql.unsafe(statement.text, statement.values);
    insertedCount += Number(result.count || 0);
  }

  return insertedCount;
}
