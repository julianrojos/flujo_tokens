/**
 * Design System Sync Job Repository
 *
 * PostgreSQL-backed persistence for design system sync jobs.
 */

import type { Sql } from 'postgres';

export type DesignSystemSyncJobStatus = 'queued' | 'running' | 'success' | 'error' | 'cancelled';

export interface DesignSystemSyncJobRow {
  job_id: string;
  system_id: string;
  operation_name: string;
  label: string;
  status: DesignSystemSyncJobStatus;
  request_id: string | null;
  started_at: Date | null;
  finished_at: Date | null;
  result_json: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

export interface UpsertDesignSystemSyncJobInput {
  jobId: string;
  systemId: string;
  operationName: string;
  label: string;
  status: DesignSystemSyncJobStatus;
  requestId?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  result?: Record<string, unknown> | null;
}

export interface DesignSystemSyncJobState {
  id: string;
  label: string;
  operation: string;
  status: DesignSystemSyncJobStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  systemId: string;
  requestId: string | null;
  sourceEventId: string | null;
  result?: Record<string, unknown> | null;
}

export class DesignSystemSyncJobRepository {
  constructor(private sql: Sql) {}

  async upsertJob(input: UpsertDesignSystemSyncJobInput): Promise<void> {
    // `system_id` is historical metadata, not a live FK, so sync history can
    // survive design system deletion and still be queried by job id.
    await this.sql`
      INSERT INTO design_system_sync_jobs (
        job_id,
        system_id,
        operation_name,
        label,
        status,
        request_id,
        started_at,
        finished_at,
        result_json,
        created_at,
        updated_at
      ) VALUES (
        ${input.jobId},
        ${input.systemId},
        ${input.operationName},
        ${input.label},
        ${input.status},
        ${input.requestId ?? null},
        ${input.startedAt ? new Date(input.startedAt) : null},
        ${input.finishedAt ? new Date(input.finishedAt) : null},
        ${input.result ?? null},
        now(),
        now()
      )
      ON CONFLICT (job_id) DO UPDATE SET
        system_id = EXCLUDED.system_id,
        operation_name = EXCLUDED.operation_name,
        label = EXCLUDED.label,
        status = EXCLUDED.status,
        request_id = EXCLUDED.request_id,
        started_at = EXCLUDED.started_at,
        finished_at = EXCLUDED.finished_at,
        result_json = EXCLUDED.result_json,
        updated_at = now()
    `;
  }

  async getJob(jobId: string): Promise<DesignSystemSyncJobState | null> {
    const rows = (await this.sql`
      SELECT
        job_id,
        system_id,
        operation_name,
        label,
        status,
        request_id,
        started_at,
        finished_at,
        result_json,
        created_at,
        updated_at
      FROM design_system_sync_jobs
      WHERE job_id = ${jobId}
      LIMIT 1
    `) as Array<DesignSystemSyncJobRow>;

    const row = rows[0];
    if (!row) return null;
    return {
      id: row.job_id,
      label: row.label,
      operation: row.operation_name,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      startedAt: row.started_at ? row.started_at.toISOString() : undefined,
      finishedAt: row.finished_at ? row.finished_at.toISOString() : undefined,
      systemId: row.system_id,
      requestId: row.request_id,
      sourceEventId: null,
      result: row.result_json ?? undefined,
    };
  }
}
