import type { Sql } from 'postgres';
import { randomUUID } from 'node:crypto';

export interface DsConsumer {
  id: string;
  ds_file_key: string;
  consumer_file_key: string;
  consumer_name: string;
  created_at: Date;
}

export interface DsSyncRun {
  id: string;
  consumer_id: string;
  synced_at: Date;
  duration_ms: number;
  status: 'ok' | 'error' | 'partial' | 'skipped';
  error_message?: string;
  ds_last_modified?: string;
  consumer_last_modified?: string;
  component_count: number;
  variable_count: number;
  warning_count: number;
  local_component_used_count?: number | null;
  parent_derived_component_count?: number | null;
  local_variable_defined_count?: number | null;
  local_variable_used_count?: number | null;
  consumer_usage_details_json?: unknown | null;
}

export interface DsComponentUsage {
  id: number;
  run_id: string;
  component_key: string;
  component_name: string;
  instance_count: number;
  sample_node_ids_json?: unknown;
}

export interface DsVariableUsage {
  id: number;
  run_id: string;
  variable_key: string;
  variable_name: string;
  variable_type: string;
  node_count: number;
  sample_node_ids_json?: unknown;
}

export interface DsParentVariableUsage {
  id: number;
  ds_file_key: string;
  variable_key: string;
  variable_name: string;
  variable_type: string;
  node_count: number;
  sample_node_ids_json?: unknown;
  captured_at: Date;
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
  local_component_used_count?: number | null;
  parent_derived_component_count?: number | null;
  local_variable_defined_count?: number | null;
  local_variable_used_count?: number | null;
  consumer_usage_details_json?: unknown | null;
}

export class DependencyRepository {
  constructor(private sql: Sql) {}

  private normalizeDsFileKey(dsFileKey: string): string {
    if (!dsFileKey || !dsFileKey.trim()) {
      throw new Error('dsFileKey is required and cannot be empty');
    }
    return dsFileKey.trim();
  }

  private async removeParentVariableUsageByDsFileKeyWithSql(
    sql: Sql,
    dsFileKey: string,
  ): Promise<number> {
    const normalizedKey = this.normalizeDsFileKey(dsFileKey);

    const result = await sql`
      DELETE FROM ds_parent_variable_usage
      WHERE ds_file_key = ${normalizedKey}
    `;
    return result.count ?? 0;
  }

  private async removeAllConsumersByDsFileKeyWithSql(
    sql: Sql,
    dsFileKey: string,
  ): Promise<{ deletedConsumerIds: string[]; deletedConsumerCount: number }> {
    const normalizedKey = this.normalizeDsFileKey(dsFileKey);

    const consumers = (await sql`
      SELECT id FROM ds_consumers WHERE ds_file_key = ${normalizedKey}
    `) as Array<{ id: string }>;
    const consumerIds = consumers.map((c) => c.id);

    if (consumerIds.length === 0) {
      return { deletedConsumerIds: [], deletedConsumerCount: 0 };
    }

    await sql`
      DELETE FROM ds_sync_warnings
      WHERE run_id IN (
        SELECT r.id FROM ds_sync_runs r
        JOIN ds_consumers c ON r.consumer_id = c.id
        WHERE c.ds_file_key = ${normalizedKey}
      )
    `;

    await sql`
      DELETE FROM ds_component_usage
      WHERE run_id IN (
        SELECT r.id FROM ds_sync_runs r
        JOIN ds_consumers c ON r.consumer_id = c.id
        WHERE c.ds_file_key = ${normalizedKey}
      )
    `;

    await sql`
      DELETE FROM ds_variable_usage
      WHERE run_id IN (
        SELECT r.id FROM ds_sync_runs r
        JOIN ds_consumers c ON r.consumer_id = c.id
        WHERE c.ds_file_key = ${normalizedKey}
      )
    `;

    await sql`
      DELETE FROM ds_sync_runs
      WHERE consumer_id IN (
        SELECT id FROM ds_consumers WHERE ds_file_key = ${normalizedKey}
      )
    `;

    await sql`
      DELETE FROM ds_consumers WHERE ds_file_key = ${normalizedKey}
    `;

    return {
      deletedConsumerIds: consumerIds,
      deletedConsumerCount: consumerIds.length,
    };
  }

  async addConsumer(params: AddConsumerParams): Promise<DsConsumer> {
    const id = randomUUID();

    try {
      await this.sql`
        INSERT INTO ds_consumers (
          id, ds_file_key, consumer_file_key, consumer_name
        ) VALUES (${id}, ${params.ds_file_key}, ${params.consumer_file_key}, ${params.consumer_name})
      `;
    } catch (error) {
      if (error instanceof Error && error.message.includes('duplicate')) {
        throw {
          code: 'deps.consumer.duplicate',
          message: `Consumer already exists for DS file ${params.ds_file_key} and consumer file ${params.consumer_file_key}`,
        };
      }
      throw error;
    }

    const consumer = await this.getConsumer(id);
    if (!consumer) {
      throw new Error('Failed to retrieve inserted consumer');
    }
    return consumer;
  }

  async removeConsumer(consumerId: string): Promise<void> {
    await this
      .sql`DELETE FROM ds_sync_warnings WHERE run_id IN (SELECT id FROM ds_sync_runs WHERE consumer_id = ${consumerId})`;
    await this
      .sql`DELETE FROM ds_component_usage WHERE run_id IN (SELECT id FROM ds_sync_runs WHERE consumer_id = ${consumerId})`;
    await this
      .sql`DELETE FROM ds_variable_usage WHERE run_id IN (SELECT id FROM ds_sync_runs WHERE consumer_id = ${consumerId})`;
    await this.sql`DELETE FROM ds_sync_runs WHERE consumer_id = ${consumerId}`;
    await this.sql`DELETE FROM ds_consumers WHERE id = ${consumerId}`;
  }

  async listConsumers(
    dsFileKey: string,
  ): Promise<(DsConsumer & { latest_sync?: DsSyncRun })[]> {
    const rows = (await this.sql`
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
        r.local_component_used_count as sync_local_component_used_count,
        r.parent_derived_component_count as sync_parent_derived_component_count,
        r.local_variable_defined_count as sync_local_variable_defined_count,
        r.local_variable_used_count as sync_local_variable_used_count,
        r.consumer_usage_details_json as sync_consumer_usage_details_json
      FROM ds_consumers c
      LEFT JOIN LATERAL (
        SELECT r2.id, r2.synced_at, r2.duration_ms, r2.status, r2.error_message, r2.ds_last_modified, r2.consumer_last_modified, r2.component_count, r2.variable_count, r2.warning_count, r2.local_component_used_count, r2.parent_derived_component_count, r2.local_variable_defined_count, r2.local_variable_used_count, r2.consumer_usage_details_json
        FROM ds_sync_runs r2
        WHERE r2.consumer_id = c.id
        ORDER BY r2.synced_at DESC, r2.id DESC
        LIMIT 1
      ) r ON true
      WHERE c.ds_file_key = ${dsFileKey}
      ORDER BY c.created_at DESC
    `) as Array<Record<string, unknown>>;

    return rows.map((row) => {
      const result: DsConsumer & { latest_sync?: DsSyncRun } = {
        id: row.id as string,
        ds_file_key: row.ds_file_key as string,
        consumer_file_key: row.consumer_file_key as string,
        consumer_name: row.consumer_name as string,
        created_at: row.created_at as Date,
      };
      if (row.sync_id) {
        result.latest_sync = {
          id: row.sync_id as string,
          consumer_id: row.id as string,
          synced_at: row.sync_synced_at as Date,
          duration_ms: row.sync_duration_ms as number,
          status: row.sync_status as DsSyncRun['status'],
          error_message: row.sync_error_message as string | undefined,
          ds_last_modified: row.sync_ds_last_modified as string | undefined,
          consumer_last_modified: row.sync_consumer_last_modified as
            | string
            | undefined,
          component_count: row.sync_component_count as number,
          variable_count: row.sync_variable_count as number,
          warning_count: row.sync_warning_count as number,
          local_component_used_count: row.sync_local_component_used_count as
            | number
            | null,
          parent_derived_component_count:
            row.sync_parent_derived_component_count as number | null,
          local_variable_defined_count:
            row.sync_local_variable_defined_count as number | null,
          local_variable_used_count: row.sync_local_variable_used_count as
            | number
            | null,
          consumer_usage_details_json: row.sync_consumer_usage_details_json,
        };
      }
      return result;
    });
  }

  async getConsumer(consumerId: string): Promise<DsConsumer | null> {
    try {
      const rows = (await this
        .sql`SELECT * FROM ds_consumers WHERE id = ${consumerId}`) as Array<DsConsumer>;
      return rows.length > 0 ? rows[0] : null;
    } catch (error) {
      console.error(
        `[DependencyRepository] Failed to get consumer by id: ${consumerId}`,
        error,
      );
      throw error;
    }
  }

  async getConsumerByFileKeys(
    dsFileKey: string,
    consumerFileKey: string,
  ): Promise<DsConsumer | null> {
    try {
      const rows = (await this.sql`
        SELECT * FROM ds_consumers
        WHERE ds_file_key = ${dsFileKey} AND consumer_file_key = ${consumerFileKey}
        LIMIT 1
      `) as Array<DsConsumer>;
      return rows.length > 0 ? rows[0] : null;
    } catch (error) {
      console.error(
        `[DependencyRepository] Failed to get consumer by file keys: ds=${dsFileKey}, consumer=${consumerFileKey}`,
        error,
      );
      throw error;
    }
  }

  async saveSyncRun(params: SaveSyncRunParams): Promise<DsSyncRun> {
    const validStatuses: SaveSyncRunParams['status'][] = [
      'ok',
      'error',
      'partial',
      'skipped',
    ];
    if (!validStatuses.includes(params.status)) {
      throw new Error(`Invalid sync status: ${String(params.status)}`);
    }

    const runId = randomUUID();

    await this.sql.begin(async (tx) => {
      await tx`
        INSERT INTO ds_sync_runs (
          id, consumer_id, synced_at, duration_ms, status, error_message,
          ds_last_modified, consumer_last_modified, component_count, variable_count, warning_count,
          local_component_used_count, parent_derived_component_count, local_variable_defined_count, local_variable_used_count, consumer_usage_details_json
        ) VALUES (
          ${runId}, ${params.consumer_id}, now(), ${params.duration_ms}, ${params.status}, ${params.error_message ?? null},
          ${params.ds_last_modified ?? null}, ${params.consumer_last_modified ?? null}, ${params.component_usage?.length ?? 0}, ${params.variable_usage?.length ?? 0}, ${params.warnings?.length ?? 0},
          ${params.local_component_used_count ?? null}, ${params.parent_derived_component_count ?? null}, ${params.local_variable_defined_count ?? null}, ${params.local_variable_used_count ?? null}, ${JSON.stringify(params.consumer_usage_details_json ?? null)}
        )
      `;

      for (const component of params.component_usage || []) {
        await tx`
          INSERT INTO ds_component_usage (
            run_id, component_key, component_name, instance_count, sample_node_ids_json
          ) VALUES (${runId}, ${component.component_key}, ${component.component_name}, ${component.instance_count}, ${component.sample_node_ids_json ?? null})
        `;
      }

      for (const variable of params.variable_usage || []) {
        await tx`
          INSERT INTO ds_variable_usage (
            run_id, variable_key, variable_name, variable_type, node_count, sample_node_ids_json
          ) VALUES (${runId}, ${variable.variable_key}, ${variable.variable_name}, ${variable.variable_type}, ${variable.node_count}, ${variable.sample_node_ids_json ?? null})
        `;
      }

      for (const warning of params.warnings || []) {
        await tx`
          INSERT INTO ds_sync_warnings (run_id, code, message, node_id)
          VALUES (${runId}, ${warning.code}, ${warning.message}, ${warning.node_id ?? null})
        `;
      }
    });

    const rows = (await this
      .sql`SELECT * FROM ds_sync_runs WHERE id = ${runId}`) as Array<DsSyncRun>;
    return rows[0];
  }

  async getLatestSyncRun(consumerId: string): Promise<DsSyncRun | null> {
    try {
      const rows = (await this.sql`
        SELECT * FROM ds_sync_runs
        WHERE consumer_id = ${consumerId}
        ORDER BY synced_at DESC, id DESC
        LIMIT 1
      `) as Array<DsSyncRun>;
      return rows.length > 0 ? rows[0] : null;
    } catch (error) {
      console.error(
        `[DependencyRepository] Failed to get latest sync run for consumer: ${consumerId}`,
        error,
      );
      throw error;
    }
  }

  async getLatestComponentUsage(
    dsFileKey: string,
  ): Promise<
    (DsComponentUsage & {
      consumer_id: string;
      consumer_name: string;
      consumer_file_key: string;
      synced_at: Date;
    })[]
  > {
    const rows = (await this.sql`
      SELECT
        cu.*,
        c.id as consumer_id,
        c.consumer_name,
        c.consumer_file_key,
        r.synced_at
      FROM ds_component_usage cu
      JOIN ds_sync_runs r ON cu.run_id = r.id
      JOIN ds_consumers c ON r.consumer_id = c.id
      WHERE c.ds_file_key = ${dsFileKey}
      AND r.id = (
        SELECT r2.id FROM ds_sync_runs r2
        WHERE r2.consumer_id = c.id
        ORDER BY r2.synced_at DESC, r2.id DESC
        LIMIT 1
      )
      ORDER BY cu.instance_count DESC
    `) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: row.id as number,
      run_id: row.run_id as string,
      component_key: row.component_key as string,
      component_name: row.component_name as string,
      instance_count: row.instance_count as number,
      sample_node_ids_json: row.sample_node_ids_json as
        | unknown
        | undefined,
      consumer_id: row.consumer_id as string,
      consumer_name: row.consumer_name as string,
      consumer_file_key: row.consumer_file_key as string,
      synced_at: row.synced_at as Date,
    }));
  }

  async getLatestVariableUsage(
    dsFileKey: string,
  ): Promise<
    (DsVariableUsage & {
      consumer_id: string;
      consumer_name: string;
      consumer_file_key: string;
      synced_at: Date;
    })[]
  > {
    const rows = (await this.sql`
      SELECT
        vu.*,
        c.id as consumer_id,
        c.consumer_name,
        c.consumer_file_key,
        r.synced_at
      FROM ds_variable_usage vu
      JOIN ds_sync_runs r ON vu.run_id = r.id
      JOIN ds_consumers c ON r.consumer_id = c.id
      WHERE c.ds_file_key = ${dsFileKey}
      AND r.id = (
        SELECT r2.id FROM ds_sync_runs r2
        WHERE r2.consumer_id = c.id
        ORDER BY r2.synced_at DESC, r2.id DESC
        LIMIT 1
      )
      ORDER BY vu.node_count DESC
    `) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: row.id as number,
      run_id: row.run_id as string,
      variable_key: row.variable_key as string,
      variable_name: row.variable_name as string,
      variable_type: row.variable_type as string,
      node_count: row.node_count as number,
      sample_node_ids_json: row.sample_node_ids_json as
        | unknown
        | undefined,
      consumer_id: row.consumer_id as string,
      consumer_name: row.consumer_name as string,
      consumer_file_key: row.consumer_file_key as string,
      synced_at: row.synced_at as Date,
    }));
  }

  async replaceParentVariableUsage(
    dsFileKey: string,
    usageRows: Array<{
      variable_key: string;
      variable_name: string;
      variable_type: string;
      node_count: number;
      sample_node_ids_json?: unknown;
    }>,
  ): Promise<void> {
    const normalizedDsFileKey = String(dsFileKey || '').trim();
    if (!normalizedDsFileKey) {
      throw new Error(
        'replaceParentVariableUsage requires a non-empty dsFileKey',
      );
    }
    for (const row of usageRows) {
      if (!String(row.variable_key || '').trim()) {
        throw new Error(
          'replaceParentVariableUsage requires non-empty variable_key',
        );
      }
      if (!String(row.variable_name || '').trim()) {
        throw new Error(
          'replaceParentVariableUsage requires non-empty variable_name',
        );
      }
      if (!String(row.variable_type || '').trim()) {
        throw new Error(
          'replaceParentVariableUsage requires non-empty variable_type',
        );
      }
      if (!Number.isFinite(row.node_count) || row.node_count < 0) {
        throw new Error(
          'replaceParentVariableUsage requires node_count to be a non-negative number',
        );
      }
    }

    try {
      await this
        .sql`DELETE FROM ds_parent_variable_usage WHERE ds_file_key = ${normalizedDsFileKey}`;
      for (const row of usageRows) {
        await this.sql`
          INSERT INTO ds_parent_variable_usage (
            ds_file_key,
            variable_key,
            variable_name,
            variable_type,
            node_count,
            sample_node_ids_json,
            captured_at
          ) VALUES (
            ${normalizedDsFileKey},
            ${row.variable_key},
            ${row.variable_name},
            ${row.variable_type},
            ${row.node_count},
            ${row.sample_node_ids_json ?? null},
            now()
          )
        `;
      }
    } catch (error) {
      console.error(
        `[DependencyRepository] Failed to replace parent variable usage: ds=${normalizedDsFileKey}`,
        error,
      );
      throw error;
    }
  }

  async getParentVariableUsage(
    dsFileKey: string,
  ): Promise<DsParentVariableUsage[]> {
    try {
      return (await this.sql`
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
        WHERE ds_file_key = ${dsFileKey}
        ORDER BY node_count DESC, variable_name ASC
      `) as DsParentVariableUsage[];
    } catch (error) {
      console.error(
        `[DependencyRepository] Failed to get parent variable usage: ds=${dsFileKey}`,
        error,
      );
      throw error;
    }
  }

  async getLatestWarnings(
    dsFileKey: string,
  ): Promise<
    (DsSyncWarning & { consumer_name: string; consumer_file_key: string })[]
  > {
    const rows = (await this.sql`
      SELECT
        w.*,
        c.consumer_name,
        c.consumer_file_key
      FROM ds_sync_warnings w
      JOIN ds_sync_runs r ON w.run_id = r.id
      JOIN ds_consumers c ON r.consumer_id = c.id
      WHERE c.ds_file_key = ${dsFileKey}
      AND r.id = (
        SELECT r2.id FROM ds_sync_runs r2
        WHERE r2.consumer_id = c.id
        ORDER BY r2.synced_at DESC, r2.id DESC
        LIMIT 1
      )
      ORDER BY r.synced_at DESC, w.id
    `) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: row.id as number,
      run_id: row.run_id as string,
      code: row.code as string,
      message: row.message as string,
      node_id: row.node_id as string | undefined,
      consumer_name: row.consumer_name as string,
      consumer_file_key: row.consumer_file_key as string,
    }));
  }

  async pruneOldRuns(
    consumerId: string,
    keepCount: number = 20,
  ): Promise<number> {
    if (!Number.isInteger(keepCount) || keepCount < 0) {
      throw new Error('keepCount must be a non-negative integer');
    }

    const oldRuns = (await this.sql`
      SELECT id FROM ds_sync_runs
      WHERE consumer_id = ${consumerId}
      ORDER BY synced_at DESC, id DESC
      OFFSET ${keepCount}
    `) as Array<{ id: string }>;

    if (oldRuns.length === 0) {
      return 0;
    }

    const runIds = oldRuns.map((r) => r.id);
    await this.sql`DELETE FROM ds_sync_warnings WHERE run_id = ANY(${runIds})`;
    await this.sql`DELETE FROM ds_component_usage WHERE run_id = ANY(${runIds})`;
    await this.sql`DELETE FROM ds_variable_usage WHERE run_id = ANY(${runIds})`;
    await this.sql`DELETE FROM ds_sync_runs WHERE id = ANY(${runIds})`;

    return oldRuns.length;
  }

  async listSyncRuns(consumerId: string, limit = 20): Promise<DsSyncRun[]> {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error('limit must be a positive integer');
    }

    const rows = (await this.sql`
      SELECT * FROM ds_sync_runs
      WHERE consumer_id = ${consumerId}
      ORDER BY synced_at DESC, id DESC
      LIMIT ${limit}
    `) as DsSyncRun[];

    return rows.map((row) => ({
      ...row,
      status: row.status as DsSyncRun['status'],
    }));
  }

  async removeParentVariableUsageByDsFileKey(
    dsFileKey: string,
  ): Promise<number> {
    return this.removeParentVariableUsageByDsFileKeyWithSql(this.sql, dsFileKey);
  }

  async removeAllConsumersByDsFileKey(
    dsFileKey: string,
  ): Promise<{ deletedConsumerIds: string[]; deletedConsumerCount: number }> {
    return this.removeAllConsumersByDsFileKeyWithSql(this.sql, dsFileKey);
  }

  async removeAllByDsFileKey(
    dsFileKey: string,
  ): Promise<{ deletedConsumerIds: string[]; deletedConsumerCount: number }> {
    let deletedConsumers = { deletedConsumerIds: [] as string[], deletedConsumerCount: 0 };
    await this.sql.begin(async (tx) => {
      await this.removeParentVariableUsageByDsFileKeyWithSql(tx, dsFileKey);
      deletedConsumers = await this.removeAllConsumersByDsFileKeyWithSql(tx, dsFileKey);
    });
    return deletedConsumers;
  }

  async getDeletePreview(dsFileKey: string): Promise<{
    consumers: Array<{
      id: string;
      name: string;
      fileKey: string;
      lastSyncedAt?: Date;
    }>;
    totalConsumerCount: number;
    counts: {
      syncRuns: number;
      componentUsage: number;
      variableUsage: number;
      parentVariableUsage: number;
    };
  }> {
    if (!dsFileKey || !dsFileKey.trim()) {
      return {
        consumers: [],
        totalConsumerCount: 0,
        counts: {
          syncRuns: 0,
          componentUsage: 0,
          variableUsage: 0,
          parentVariableUsage: 0,
        },
      };
    }

    const normalizedKey = dsFileKey.trim();

    const consumers = (await this.sql`
      SELECT
        c.id,
        c.consumer_name,
        c.consumer_file_key,
        MAX(sr.synced_at) as last_synced_at
      FROM ds_consumers c
      LEFT JOIN ds_sync_runs sr ON c.id = sr.consumer_id
      WHERE c.ds_file_key = ${normalizedKey}
      GROUP BY c.id
      ORDER BY c.consumer_name
      LIMIT 20
    `) as Array<Record<string, unknown>>;

    const totalCountResult = (await this.sql`
      SELECT COUNT(*) as count FROM ds_consumers WHERE ds_file_key = ${normalizedKey}
    `) as Array<{ count: number | string }>;

    const syncRunsCount = (await this.sql`
      SELECT COUNT(*) as count FROM ds_sync_runs
      WHERE consumer_id IN (SELECT id FROM ds_consumers WHERE ds_file_key = ${normalizedKey})
    `) as Array<{ count: number | string }>;

    const componentUsageCount = (await this.sql`
      SELECT COUNT(*) as count FROM ds_component_usage
      WHERE run_id IN (SELECT id FROM ds_sync_runs WHERE consumer_id IN (SELECT id FROM ds_consumers WHERE ds_file_key = ${normalizedKey}))
    `) as Array<{ count: number | string }>;

    const variableUsageCount = (await this.sql`
      SELECT COUNT(*) as count FROM ds_variable_usage
      WHERE run_id IN (SELECT id FROM ds_sync_runs WHERE consumer_id IN (SELECT id FROM ds_consumers WHERE ds_file_key = ${normalizedKey}))
    `) as Array<{ count: number | string }>;

    const parentVariableUsageCount = (await this.sql`
      SELECT COUNT(*) as count FROM ds_parent_variable_usage WHERE ds_file_key = ${normalizedKey}
    `) as Array<{ count: number | string }>;

    return {
      consumers: consumers.map((c) => ({
        id: c.id as string,
        name: c.consumer_name as string,
        fileKey: c.consumer_file_key as string,
        lastSyncedAt: c.last_synced_at as Date | undefined,
      })),
      totalConsumerCount: Number(totalCountResult[0]?.count ?? 0),
      counts: {
        syncRuns: Number(syncRunsCount[0]?.count ?? 0),
        componentUsage: Number(componentUsageCount[0]?.count ?? 0),
        variableUsage: Number(variableUsageCount[0]?.count ?? 0),
        parentVariableUsage: Number(parentVariableUsageCount[0]?.count ?? 0),
      },
    };
  }
}
