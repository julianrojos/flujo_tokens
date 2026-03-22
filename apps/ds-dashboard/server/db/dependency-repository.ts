import type { Database as DatabaseType } from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

// Types for dependency tracking
export interface DsConsumer {
  id: string;
  ds_file_key: string;
  consumer_file_key: string;
  consumer_name: string;
  enabled: boolean;
  created_at: string;
}

export interface DsSyncRun {
  id: string;
  consumer_id: string;
  synced_at: string;
  duration_ms: number;
  status: 'ok' | 'error' | 'partial' | 'skipped';
  error_message?: string;
  ds_last_modified?: string;
  consumer_last_modified?: string;
  component_count: number;
  variable_count: number;
  warning_count: number;
}

export interface DsComponentUsage {
  id: number;
  run_id: string;
  component_key: string;
  component_name: string;
  instance_count: number;
  sample_node_ids_json?: string;
}

export interface DsVariableUsage {
  id: number;
  run_id: string;
  variable_key: string;
  variable_name: string;
  variable_type: string;
  node_count: number;
  sample_node_ids_json?: string;
}

export interface DsSyncWarning {
  id: number;
  run_id: string;
  code: string;
  message: string;
  node_id?: string;
}

export interface AddConsumerParams {
  ds_file_key: string;
  consumer_file_key: string;
  consumer_name: string;
  enabled?: boolean;
}

export interface SaveSyncRunParams {
  consumer_id: string;
  duration_ms: number;
  status: DsSyncRun['status'];
  error_message?: string;
  ds_last_modified?: string;
  consumer_last_modified?: string;
  component_usage: Omit<DsComponentUsage, 'id' | 'run_id'>[];
  variable_usage: Omit<DsVariableUsage, 'id' | 'run_id'>[];
  warnings: Omit<DsSyncWarning, 'id' | 'run_id'>[];
}

export class DependencyRepository {
  constructor(private db: DatabaseType) {
    // Enforce FK checks for this connection to keep relational integrity predictable.
    this.db.pragma('foreign_keys = ON');
  }

  addConsumer(params: AddConsumerParams): DsConsumer {
    const id = randomUUID();
    const stmt = this.db.prepare(`
      INSERT INTO ds_consumers (
        id, ds_file_key, consumer_file_key, consumer_name, enabled
      ) VALUES (?, ?, ?, ?, ?)
    `);

    try {
      stmt.run(
        id,
        params.ds_file_key,
        params.consumer_file_key,
        params.consumer_name,
        params.enabled !== false ? 1 : 0  // SQLite boolean as 1/0
      );
    } catch (error) {
      // Handle UNIQUE constraint violation
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
        throw {
          code: 'deps.consumer.duplicate',
          message: `Consumer already exists for DS file ${params.ds_file_key} and consumer file ${params.consumer_file_key}`,
        };
      }
      throw error;
    }

    const consumer = this.getConsumer(id);
    if (!consumer) {
      throw new Error('Failed to retrieve inserted consumer');
    }
    return consumer;
  }

  removeConsumer(consumerId: string): void {
    // SQLite with foreign keys needs cascade to be handled manually
    const deleteWarnings = this.db.prepare('DELETE FROM ds_sync_warnings WHERE run_id IN (SELECT id FROM ds_sync_runs WHERE consumer_id = ?)');
    const deleteComponentUsage = this.db.prepare('DELETE FROM ds_component_usage WHERE run_id IN (SELECT id FROM ds_sync_runs WHERE consumer_id = ?)');
    const deleteVariableUsage = this.db.prepare('DELETE FROM ds_variable_usage WHERE run_id IN (SELECT id FROM ds_sync_runs WHERE consumer_id = ?)');
    const deleteRuns = this.db.prepare('DELETE FROM ds_sync_runs WHERE consumer_id = ?');
    const deleteConsumer = this.db.prepare('DELETE FROM ds_consumers WHERE id = ?');

    const transaction = this.db.transaction(() => {
      deleteWarnings.run(consumerId);
      deleteComponentUsage.run(consumerId);
      deleteVariableUsage.run(consumerId);
      deleteRuns.run(consumerId);
      deleteConsumer.run(consumerId);
    });

    transaction();
  }

  listConsumers(dsFileKey: string): (DsConsumer & { latest_sync?: DsSyncRun })[] {
    const stmt = this.db.prepare(`
      SELECT
        c.*,
        r.id as sync_id,
        r.synced_at as sync_synced_at,
        r.duration_ms as sync_duration_ms,
        r.status as sync_status,
        r.error_message as sync_error_message,
        r.ds_last_modified as sync_ds_last_modified,
        r.consumer_last_modified as sync_consumer_last_modified,
        r.component_count as sync_component_count,
        r.variable_count as sync_variable_count,
        r.warning_count as sync_warning_count
      FROM ds_consumers c
      LEFT JOIN ds_sync_runs r ON r.id = (
        SELECT r2.id
        FROM ds_sync_runs r2
        WHERE r2.consumer_id = c.id
        ORDER BY r2.synced_at DESC, r2.id DESC
        LIMIT 1
      )
      WHERE c.ds_file_key = ?
      ORDER BY c.created_at DESC
    `);

    const rows = stmt.all(dsFileKey) as any[];
    return rows.map((row) => {
      const result: DsConsumer & { latest_sync?: DsSyncRun } = {
        id: row.id,
        ds_file_key: row.ds_file_key,
        consumer_file_key: row.consumer_file_key,
        consumer_name: row.consumer_name,
        enabled: Boolean(row.enabled),
        created_at: row.created_at,
      };
      if (row.sync_id) {
        result.latest_sync = {
          id: row.sync_id,
          consumer_id: row.id,
          synced_at: row.sync_synced_at,
          duration_ms: row.sync_duration_ms,
          status: row.sync_status,
          error_message: row.sync_error_message,
          ds_last_modified: row.sync_ds_last_modified,
          consumer_last_modified: row.sync_consumer_last_modified,
          component_count: row.sync_component_count,
          variable_count: row.sync_variable_count,
          warning_count: row.sync_warning_count,
        };
      }
      return result;
    });
  }

  getConsumer(consumerId: string): DsConsumer | null {
    try {
      const stmt = this.db.prepare('SELECT * FROM ds_consumers WHERE id = ?');
      const row = stmt.get(consumerId) as DsConsumer | undefined;
      return row ? { ...row, enabled: Boolean(row.enabled) } : null;
    } catch (error) {
      console.error(`[DependencyRepository] Failed to get consumer by id: ${consumerId}`, error);
      throw error;
    }
  }

  updateConsumerEnabled(consumerId: string, enabled: boolean): DsConsumer | null {
    try {
      const stmt = this.db.prepare(`
        UPDATE ds_consumers
        SET enabled = ?
        WHERE id = ?
      `);
      stmt.run(enabled ? 1 : 0, consumerId);
      return this.getConsumer(consumerId);
    } catch (error) {
      console.error(`[DependencyRepository] Failed to update consumer enabled state: ${consumerId}`, error);
      throw error;
    }
  }

  getConsumerByFileKeys(dsFileKey: string, consumerFileKey: string): DsConsumer | null {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM ds_consumers
        WHERE ds_file_key = ? AND consumer_file_key = ?
        LIMIT 1
      `);
      const row = stmt.get(dsFileKey, consumerFileKey) as DsConsumer | undefined;
      return row ? { ...row, enabled: Boolean(row.enabled) } : null;
    } catch (error) {
      console.error(
        `[DependencyRepository] Failed to get consumer by file keys: ds=${dsFileKey}, consumer=${consumerFileKey}`,
        error
      );
      throw error;
    }
  }

  saveSyncRun(params: SaveSyncRunParams): DsSyncRun {
    const validStatuses: SaveSyncRunParams['status'][] = ['ok', 'error', 'partial', 'skipped'];
    if (!validStatuses.includes(params.status)) {
      throw new Error(`Invalid sync status: ${String(params.status)}`);
    }

    const runId = randomUUID();

    const insertRun = this.db.prepare(`
      INSERT INTO ds_sync_runs (
        id, consumer_id, synced_at, duration_ms, status, error_message,
        ds_last_modified, consumer_last_modified, component_count, variable_count, warning_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertComponent = this.db.prepare(`
      INSERT INTO ds_component_usage (
        run_id, component_key, component_name, instance_count, sample_node_ids_json
      ) VALUES (?, ?, ?, ?, ?)
    `);

    const insertVariable = this.db.prepare(`
      INSERT INTO ds_variable_usage (
        run_id, variable_key, variable_name, variable_type, node_count, sample_node_ids_json
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertWarning = this.db.prepare(`
      INSERT INTO ds_sync_warnings (run_id, code, message, node_id)
      VALUES (?, ?, ?, ?)
    `);

    const transaction = this.db.transaction(() => {
      insertRun.run(
        runId,
        params.consumer_id,
        new Date().toISOString(),
        params.duration_ms,
        params.status,
        params.error_message,
        params.ds_last_modified,
        params.consumer_last_modified,
        params.component_usage.length,
        params.variable_usage.length,
        params.warnings.length
      );

      for (const component of params.component_usage) {
        insertComponent.run(
          runId,
          component.component_key,
          component.component_name,
          component.instance_count,
          component.sample_node_ids_json ?? null
        );
      }

      for (const variable of params.variable_usage) {
        insertVariable.run(
          runId,
          variable.variable_key,
          variable.variable_name,
          variable.variable_type,
          variable.node_count,
          variable.sample_node_ids_json ?? null
        );
      }

      for (const warning of params.warnings) {
        insertWarning.run(runId, warning.code, warning.message, warning.node_id ?? null);
      }
    });
    transaction();

    const run = this.db.prepare('SELECT * FROM ds_sync_runs WHERE id = ?').get(runId) as DsSyncRun;
    return run;
  }

  getLatestSyncRun(consumerId: string): DsSyncRun | null {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM ds_sync_runs
        WHERE consumer_id = ?
        ORDER BY synced_at DESC, id DESC
        LIMIT 1
      `);
      const row = stmt.get(consumerId) as DsSyncRun | undefined;
      return row || null;
    } catch (error) {
      console.error(`[DependencyRepository] Failed to get latest sync run for consumer: ${consumerId}`, error);
      throw error;
    }
  }

  getLatestComponentUsage(dsFileKey: string): (DsComponentUsage & { consumer_id: string; consumer_name: string; consumer_file_key: string; synced_at: string })[] {
    const stmt = this.db.prepare(`
      SELECT 
        cu.*,
        c.id as consumer_id,
        c.consumer_name,
        c.consumer_file_key,
        r.synced_at
      FROM ds_component_usage cu
      JOIN ds_sync_runs r ON cu.run_id = r.id
      JOIN ds_consumers c ON r.consumer_id = c.id
      WHERE c.ds_file_key = ?
      AND r.id = (
        SELECT r2.id FROM ds_sync_runs r2
        WHERE r2.consumer_id = c.id
        ORDER BY r2.synced_at DESC, r2.id DESC
        LIMIT 1
      )
      ORDER BY cu.instance_count DESC
    `);
    return stmt.all(dsFileKey) as any[];
  }

  getLatestVariableUsage(dsFileKey: string): (DsVariableUsage & { consumer_id: string; consumer_name: string; consumer_file_key: string; synced_at: string })[] {
    const stmt = this.db.prepare(`
      SELECT 
        vu.*,
        c.id as consumer_id,
        c.consumer_name,
        c.consumer_file_key,
        r.synced_at
      FROM ds_variable_usage vu
      JOIN ds_sync_runs r ON vu.run_id = r.id
      JOIN ds_consumers c ON r.consumer_id = c.id
      WHERE c.ds_file_key = ?
      AND r.id = (
        SELECT r2.id FROM ds_sync_runs r2
        WHERE r2.consumer_id = c.id
        ORDER BY r2.synced_at DESC, r2.id DESC
        LIMIT 1
      )
      ORDER BY vu.node_count DESC
    `);
    return stmt.all(dsFileKey) as any[];
  }

  getLatestWarnings(dsFileKey: string): (DsSyncWarning & { consumer_name: string; consumer_file_key: string })[] {
    const stmt = this.db.prepare(`
      SELECT 
        w.*,
        c.consumer_name,
        c.consumer_file_key
      FROM ds_sync_warnings w
      JOIN ds_sync_runs r ON w.run_id = r.id
      JOIN ds_consumers c ON r.consumer_id = c.id
      WHERE c.ds_file_key = ?
      AND r.id = (
        SELECT r2.id FROM ds_sync_runs r2
        WHERE r2.consumer_id = c.id
        ORDER BY r2.synced_at DESC, r2.id DESC
        LIMIT 1
      )
      ORDER BY r.synced_at DESC, w.id
    `);
    return stmt.all(dsFileKey) as any[];
  }

  pruneOldRuns(consumerId: string, keepCount: number = 20): number {
    if (!Number.isInteger(keepCount) || keepCount < 0) {
      throw new Error('keepCount must be a non-negative integer');
    }

    const stmt = this.db.prepare(`
      SELECT id FROM ds_sync_runs
      WHERE consumer_id = ?
      ORDER BY synced_at DESC, id DESC
      LIMIT -1 OFFSET ?
    `);
    const oldRuns = stmt.all(consumerId, keepCount) as { id: string }[];

    if (oldRuns.length === 0) {
      return 0;
    }

    const runIds = oldRuns.map(r => r.id);
    const placeholders = runIds.map(() => '?').join(',');

    const deleteWarnings = this.db.prepare(`DELETE FROM ds_sync_warnings WHERE run_id IN (${placeholders})`);
    const deleteComponentUsage = this.db.prepare(`DELETE FROM ds_component_usage WHERE run_id IN (${placeholders})`);
    const deleteVariableUsage = this.db.prepare(`DELETE FROM ds_variable_usage WHERE run_id IN (${placeholders})`);
    const deleteRuns = this.db.prepare(`DELETE FROM ds_sync_runs WHERE id IN (${placeholders})`);

    const transaction = this.db.transaction(() => {
      deleteWarnings.run(...runIds);
      deleteComponentUsage.run(...runIds);
      deleteVariableUsage.run(...runIds);
      deleteRuns.run(...runIds);
    });

    transaction();

    return oldRuns.length;
  }

  listSyncRuns(consumerId: string, limit = 20): DsSyncRun[] {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error('limit must be a positive integer');
    }

    const stmt = this.db.prepare(`
      SELECT * FROM ds_sync_runs
      WHERE consumer_id = ?
      ORDER BY synced_at DESC, id DESC
      LIMIT ?
    `);

    const rows = stmt.all(consumerId, limit) as DsSyncRun[];
    return rows.map(row => ({
      ...row,
      status: row.status as DsSyncRun['status'],
    }));
  }
}
