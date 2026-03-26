/**
 * Pending Operations Repository
 *
 * SQLite-backed persistence for pending operations (write-ahead log).
 * Tracks in-progress operations that span multiple systems (FS, DB, config)
 * to enable recovery after server crashes.
 */

import Database from 'better-sqlite3';

/**
 * Pending operation status
 */
export type PendingOperationStatus = 'in_progress' | 'completed' | 'abandoned';

/**
 * Pending operation database row type
 */
export interface PendingOperation {
  id: string;
  type: string;
  payload: string;    // JSON raw — el caller parsea
  status: PendingOperationStatus;
  created_at: string;
  completed_at: string | null;
}

/**
 * Pending operation insert input type
 */
export interface PendingOperationInput {
  id: string;
  type: string;
  payload: Record<string, unknown>;
}

/**
 * Pending Operations Repository for write-ahead log persistence
 */
export class PendingOperationsRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Insert a new pending operation
   */
  insert(op: PendingOperationInput): void {
    const stmt = this.db.prepare(`
      INSERT INTO pending_operations (id, type, payload, status, created_at)
      VALUES (?, ?, ?, 'in_progress', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    `);
    stmt.run(op.id, op.type, JSON.stringify(op.payload));
  }

  /**
   * Mark an operation as completed
   */
  complete(id: string): void {
    const stmt = this.db.prepare(`
      UPDATE pending_operations
      SET status = 'completed', completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ? AND status = 'in_progress'
    `);
    stmt.run(id);
  }

  /**
   * Mark an operation as abandoned
   */
  abandon(id: string): void {
    const stmt = this.db.prepare(`
      UPDATE pending_operations
      SET status = 'abandoned', completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ? AND status = 'in_progress'
    `);
    stmt.run(id);
  }

  /**
   * List incomplete operations, optionally filtered by type
   */
  listIncomplete(type?: string): PendingOperation[] {
    let sql = `
      SELECT id, type, payload, status, created_at, completed_at
      FROM pending_operations
      WHERE status = 'in_progress'
    `;
    const params: unknown[] = [];

    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }

    sql += ' ORDER BY created_at ASC';

    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as PendingOperation[];
  }
}
