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
  local_component_defined_count?: number | null;
  local_component_used_count?: number | null;
  local_variable_defined_count?: number | null;
  local_variable_used_count?: number | null;
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

export interface DsParentVariableUsage {
  id: number;
  ds_file_key: string;
  variable_key: string;
  variable_name: string;
  variable_type: string;
  node_count: number;
  sample_node_ids_json?: string;
  captured_at: string;
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
  local_component_defined_count?: number | null;
  local_component_used_count?: number | null;
  local_variable_defined_count?: number | null;
  local_variable_used_count?: number | null;
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
        r.warning_count as sync_warning_count,
        r.local_component_defined_count as sync_local_component_defined_count,
        r.local_component_used_count as sync_local_component_used_count,
        r.local_variable_defined_count as sync_local_variable_defined_count,
        r.local_variable_used_count as sync_local_variable_used_count
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
          local_component_defined_count: row.sync_local_component_defined_count ?? null,
          local_component_used_count: row.sync_local_component_used_count ?? null,
          local_variable_defined_count: row.sync_local_variable_defined_count ?? null,
          local_variable_used_count: row.sync_local_variable_used_count ?? null,
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
        ds_last_modified, consumer_last_modified, component_count, variable_count, warning_count,
        local_component_defined_count, local_component_used_count, local_variable_defined_count, local_variable_used_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        params.component_usage?.length || 0,
        params.variable_usage?.length || 0,
        params.warnings?.length || 0,
        params.local_component_defined_count ?? null,
        params.local_component_used_count ?? null,
        params.local_variable_defined_count ?? null,
        params.local_variable_used_count ?? null
      );

      for (const component of params.component_usage || []) {
        insertComponent.run(
          runId,
          component.component_key,
          component.component_name,
          component.instance_count,
          component.sample_node_ids_json ?? null
        );
      }

      for (const variable of params.variable_usage || []) {
        insertVariable.run(
          runId,
          variable.variable_key,
          variable.variable_name,
          variable.variable_type,
          variable.node_count,
          variable.sample_node_ids_json ?? null
        );
      }

      for (const warning of params.warnings || []) {
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

  replaceParentVariableUsage(
    dsFileKey: string,
    usageRows: Array<{
      variable_key: string;
      variable_name: string;
      variable_type: string;
      node_count: number;
      sample_node_ids_json?: string;
    }>,
  ): void {
    const normalizedDsFileKey = String(dsFileKey || '').trim();
    if (!normalizedDsFileKey) {
      throw new Error('replaceParentVariableUsage requires a non-empty dsFileKey');
    }
    for (const row of usageRows) {
      if (!String(row.variable_key || '').trim()) {
        throw new Error('replaceParentVariableUsage requires non-empty variable_key');
      }
      if (!String(row.variable_name || '').trim()) {
        throw new Error('replaceParentVariableUsage requires non-empty variable_name');
      }
      if (!String(row.variable_type || '').trim()) {
        throw new Error('replaceParentVariableUsage requires non-empty variable_type');
      }
      if (!Number.isFinite(row.node_count) || row.node_count < 0) {
        throw new Error('replaceParentVariableUsage requires node_count to be a non-negative number');
      }
    }

    try {
      const deleteStmt = this.db.prepare('DELETE FROM ds_parent_variable_usage WHERE ds_file_key = ?');
      const insertStmt = this.db.prepare(`
        INSERT INTO ds_parent_variable_usage (
          ds_file_key,
          variable_key,
          variable_name,
          variable_type,
          node_count,
          sample_node_ids_json,
          captured_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const capturedAt = new Date().toISOString();
      const tx = this.db.transaction(() => {
        deleteStmt.run(normalizedDsFileKey);
        for (const row of usageRows) {
          insertStmt.run(
            normalizedDsFileKey,
            row.variable_key,
            row.variable_name,
            row.variable_type,
            row.node_count,
            row.sample_node_ids_json ?? null,
            capturedAt,
          );
        }
      });
      tx();
    } catch (error) {
      console.error(
        `[DependencyRepository] Failed to replace parent variable usage: ds=${normalizedDsFileKey}`,
        error,
      );
      throw error;
    }
  }

  getParentVariableUsage(dsFileKey: string): DsParentVariableUsage[] {
    try {
      const stmt = this.db.prepare(`
        SELECT
          id,
          ds_file_key,
          variable_key,
          variable_name,
          variable_type,
          node_count,
          sample_node_ids_json,
          captured_at
        FROM ds_parent_variable_usage
        WHERE ds_file_key = ?
        ORDER BY node_count DESC, variable_name ASC
      `);
      return stmt.all(dsFileKey) as DsParentVariableUsage[];
    } catch (error) {
      console.error(
        `[DependencyRepository] Failed to get parent variable usage: ds=${dsFileKey}`,
        error,
      );
      throw error;
    }
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

  /**
   * Remove parent variable usage for a given DS file key
   */
  removeParentVariableUsageByDsFileKey(dsFileKey: string): number {
    if (!dsFileKey || !dsFileKey.trim()) {
      throw new Error('dsFileKey is required and cannot be empty');
    }

    const stmt = this.db.prepare(`
      DELETE FROM ds_parent_variable_usage
      WHERE ds_file_key = ?
    `);

    const result = stmt.run(dsFileKey.trim());
    return result.changes || 0;
  }

  /**
   * Remove all consumers and their associated data for a given DS file key
   * Cascades: ds_consumers → ds_sync_runs → ds_component_usage/ds_variable_usage/ds_sync_warnings
   */
  removeAllConsumersByDsFileKey(dsFileKey: string): { deletedConsumerIds: string[]; deletedConsumerCount: number } {
    if (!dsFileKey || !dsFileKey.trim()) {
      throw new Error('dsFileKey is required and cannot be empty');
    }

    const normalizedKey = dsFileKey.trim();

    // Collect consumer IDs before deletion (for return value / audit).
    const consumersStmt = this.db.prepare(`
      SELECT id FROM ds_consumers WHERE ds_file_key = ?
    `);
    const consumers = consumersStmt.all(normalizedKey) as { id: string }[];
    const consumerIds = consumers.map(c => c.id);

    if (consumerIds.length === 0) {
      return { deletedConsumerIds: [], deletedConsumerCount: 0 };
    }

    // Use subquery-based DELETEs keyed on ds_file_key to avoid SQLite's
    // SQLITE_MAX_VARIABLE_NUMBER limit when there are many consumers.
    const deleteSyncWarnings = this.db.prepare(`
      DELETE FROM ds_sync_warnings
      WHERE run_id IN (
        SELECT r.id FROM ds_sync_runs r
        JOIN ds_consumers c ON r.consumer_id = c.id
        WHERE c.ds_file_key = ?
      )
    `);

    const deleteComponentUsage = this.db.prepare(`
      DELETE FROM ds_component_usage
      WHERE run_id IN (
        SELECT r.id FROM ds_sync_runs r
        JOIN ds_consumers c ON r.consumer_id = c.id
        WHERE c.ds_file_key = ?
      )
    `);

    const deleteVariableUsage = this.db.prepare(`
      DELETE FROM ds_variable_usage
      WHERE run_id IN (
        SELECT r.id FROM ds_sync_runs r
        JOIN ds_consumers c ON r.consumer_id = c.id
        WHERE c.ds_file_key = ?
      )
    `);

    const deleteSyncRuns = this.db.prepare(`
      DELETE FROM ds_sync_runs
      WHERE consumer_id IN (
        SELECT id FROM ds_consumers WHERE ds_file_key = ?
      )
    `);

    const deleteConsumers = this.db.prepare(`
      DELETE FROM ds_consumers WHERE ds_file_key = ?
    `);

    const transaction = this.db.transaction(() => {
      deleteSyncWarnings.run(normalizedKey);
      deleteComponentUsage.run(normalizedKey);
      deleteVariableUsage.run(normalizedKey);
      deleteSyncRuns.run(normalizedKey);
      deleteConsumers.run(normalizedKey);
    });

    transaction();

    return {
      deletedConsumerIds: consumerIds,
      deletedConsumerCount: consumerIds.length,
    };
  }

  /**
   * Remove all dependency data for a given DS file key in one call.
   * Cascades: ds_parent_variable_usage + ds_consumers → ds_sync_runs → ds_component_usage/ds_variable_usage/ds_sync_warnings
   */
  removeAllByDsFileKey(dsFileKey: string): { deletedConsumerIds: string[]; deletedConsumerCount: number } {
    this.removeParentVariableUsageByDsFileKey(dsFileKey);
    return this.removeAllConsumersByDsFileKey(dsFileKey);
  }

  /**
   * Get delete preview for a DS file key - returns consumers and aggregated counts
   */
  getDeletePreview(dsFileKey: string): {
    consumers: Array<{
      id: string;
      name: string;
      fileKey: string;
      lastSyncedAt?: string;
    }>;
    totalConsumerCount: number;
    counts: {
      syncRuns: number;
      componentUsage: number;
      variableUsage: number;
      parentVariableUsage: number;
    };
  } {
    if (!dsFileKey || !dsFileKey.trim()) {
      return {
        consumers: [],
        totalConsumerCount: 0,
        counts: { syncRuns: 0, componentUsage: 0, variableUsage: 0, parentVariableUsage: 0 },
      };
    }

    // Get consumers with latest sync info, limited to 20 for preview
    const consumersStmt = this.db.prepare(`
      SELECT
        c.id,
        c.consumer_name,
        c.consumer_file_key,
        MAX(sr.synced_at) as last_synced_at
      FROM ds_consumers c
      LEFT JOIN ds_sync_runs sr ON c.id = sr.consumer_id
      WHERE c.ds_file_key = ?
      GROUP BY c.id
      ORDER BY c.consumer_name
      LIMIT 20
    `);

    const consumers = consumersStmt.all(dsFileKey.trim()) as Array<{
      id: string;
      consumer_name: string;
      consumer_file_key: string;
      last_synced_at?: string;
    }>;

    // Get total count of consumers
    const totalCountStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM ds_consumers WHERE ds_file_key = ?
    `);
    const totalCountResult = totalCountStmt.get(dsFileKey.trim()) as { count: number };

    // Get aggregated counts
    const syncRunsStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM ds_sync_runs
      WHERE consumer_id IN (SELECT id FROM ds_consumers WHERE ds_file_key = ?)
    `);
    const syncRunsCount = (syncRunsStmt.get(dsFileKey.trim()) as { count: number }).count;

    const componentUsageStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM ds_component_usage
      WHERE run_id IN (SELECT id FROM ds_sync_runs WHERE consumer_id IN (SELECT id FROM ds_consumers WHERE ds_file_key = ?))
    `);
    const componentUsageCount = (componentUsageStmt.get(dsFileKey.trim()) as { count: number }).count;

    const variableUsageStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM ds_variable_usage
      WHERE run_id IN (SELECT id FROM ds_sync_runs WHERE consumer_id IN (SELECT id FROM ds_consumers WHERE ds_file_key = ?))
    `);
    const variableUsageCount = (variableUsageStmt.get(dsFileKey.trim()) as { count: number }).count;

    const parentVariableUsageStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM ds_parent_variable_usage WHERE ds_file_key = ?
    `);
    const parentVariableUsageCount = (parentVariableUsageStmt.get(dsFileKey.trim()) as { count: number }).count;

    return {
      consumers: consumers.map(c => ({
        id: c.id,
        name: c.consumer_name,
        fileKey: c.consumer_file_key,
        lastSyncedAt: c.last_synced_at,
      })),
      totalConsumerCount: totalCountResult.count,
      counts: {
        syncRuns: syncRunsCount,
        componentUsage: componentUsageCount,
        variableUsage: variableUsageCount,
        parentVariableUsage: parentVariableUsageCount,
      },
    };
  }
}
