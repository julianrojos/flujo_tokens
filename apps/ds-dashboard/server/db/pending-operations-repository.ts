/**
 * Pending Operations Repository
 *
 * PostgreSQL-backed persistence for pending operations (write-ahead log).
 * Tracks in-progress operations that span multiple systems (FS, DB, config)
 * to enable recovery after server crashes.
 */

import type { Sql } from 'postgres';

export type PendingOperationStatus = 'in_progress' | 'completed' | 'abandoned';

export interface PendingOperation {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  status: PendingOperationStatus;
  created_at: Date;
  completed_at: Date | null;
}

export interface PendingOperationInput {
  id: string;
  type: string;
  payload: Record<string, unknown>;
}

export class PendingOperationsRepository {
  constructor(private sql: Sql) {}

  async insert(op: PendingOperationInput): Promise<void> {
    await this.sql`
      INSERT INTO pending_operations (id, type, payload, status, created_at)
      VALUES (${op.id}, ${op.type}, ${op.payload}, 'in_progress', now())
      ON CONFLICT (id) DO NOTHING
    `;
  }

  async complete(id: string): Promise<void> {
    await this.sql`
      UPDATE pending_operations
      SET status = 'completed', completed_at = now()
      WHERE id = ${id} AND status = 'in_progress'
    `;
  }

  async abandon(id: string): Promise<void> {
    await this.sql`
      UPDATE pending_operations
      SET status = 'abandoned', completed_at = now()
      WHERE id = ${id} AND status = 'in_progress'
    `;
  }

  async listIncomplete(type?: string): Promise<PendingOperation[]> {
    return this.sql`
      SELECT id, type, payload, status, created_at, completed_at
      FROM pending_operations
      WHERE status = 'in_progress'
      ${type ? this.sql`AND type = ${type}` : this.sql``}
      ORDER BY created_at ASC
    ` as Promise<PendingOperation[]>;
  }
}
