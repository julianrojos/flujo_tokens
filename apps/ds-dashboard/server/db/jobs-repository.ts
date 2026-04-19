/**
 * Jobs Repository
 *
 * PostgreSQL-backed persistence for AI jobs (AiJobState).
 * Provides CRUD operations for ai_jobs and job_events tables.
 */

import type { Sql } from 'postgres';
import type {
  AiJobState,
  AiJobEvent,
  AiJobInput,
  AiJobStatus,
} from '../services/ai-component-doc-schema.js';
import type { ComponentDocOutput } from '../services/ai-component-doc-schema.js';
import type { AiUsageMetrics } from '../services/ai-component-doc-schema.js';
import type { EditorialPatch } from '../services/ai-editorial-patch-schema.js';
import type { ValidationReport } from '../services/ai-validation-report-schema.js';

interface AiJobRow {
  id: string;
  idempotency_key: string;
  status: string;
  provider: string;
  input_json: Record<string, unknown>;
  output_json: Record<string, unknown> | null;
  usage_json: Record<string, unknown> | null;
  editorial_patch_json: Record<string, unknown> | null;
  validation_report_json: Record<string, unknown> | null;
  can_publish: boolean | null;
  pipeline_severity: string | null;
  pipeline_score: number | null;
  pipeline_stage: string | null;
  error: string | null;
  error_code: string | null;
  retryable: boolean | null;
  created_at: Date;
  updated_at: Date;
}

export class JobsRepository {
  constructor(private sql: Sql) {}

  async upsertJob(job: AiJobState): Promise<void> {
    await this.sql`
            INSERT INTO ai_jobs (
                id, idempotency_key, status, provider,
                input_json, output_json, usage_json, editorial_patch_json,
                validation_report_json, can_publish, pipeline_severity, pipeline_score, pipeline_stage,
                error, error_code, retryable,
                created_at, updated_at
            ) VALUES (
                ${job.id}, ${job.idempotencyKey}, ${job.status}, ${job.input.provider},
                ${job.input}, ${job.output ? job.output : null}, ${job.usage ? job.usage : null}, ${job.editorialPatch ? job.editorialPatch : null},
                ${job.validationReport ? job.validationReport : null}, ${job.canPublish !== undefined ? job.canPublish : null}, ${job.pipelineSeverity ?? null}, ${job.pipelineScore ?? null}, ${job.pipelineStage ?? null},
                ${job.error ?? null}, ${job.errorCode ?? null}, ${job.retryable !== undefined ? job.retryable : null},
                ${new Date(job.createdAt)}, ${new Date(job.updatedAt)}
            )
            ON CONFLICT(id) DO UPDATE SET
                idempotency_key = EXCLUDED.idempotency_key,
                status = EXCLUDED.status,
                provider = EXCLUDED.provider,
                input_json = EXCLUDED.input_json,
                output_json = EXCLUDED.output_json,
                usage_json = EXCLUDED.usage_json,
                editorial_patch_json = EXCLUDED.editorial_patch_json,
                validation_report_json = EXCLUDED.validation_report_json,
                can_publish = EXCLUDED.can_publish,
                pipeline_severity = EXCLUDED.pipeline_severity,
                pipeline_score = EXCLUDED.pipeline_score,
                pipeline_stage = EXCLUDED.pipeline_stage,
                error = EXCLUDED.error,
                error_code = EXCLUDED.error_code,
                retryable = EXCLUDED.retryable,
                updated_at = EXCLUDED.updated_at
        `;
  }

  async getMaxEventSeq(jobId: string): Promise<number> {
    const rows = (await this.sql`
            SELECT COALESCE(MAX(seq), 0) as max_seq
            FROM job_events
            WHERE job_id = ${jobId}
        `) as Array<{ max_seq: number }>;
    return rows[0]?.max_seq ?? 0;
  }

  async appendJobEvent(jobId: string, event: AiJobEvent): Promise<void> {
    await this.sql`
            INSERT INTO job_events (job_id, seq, ts, event, data)
            VALUES (${jobId}, ${event.seq}, ${new Date(event.ts)}, ${event.event}, ${event.data ? event.data : null})
        `;
  }

  async getJob(id: string): Promise<AiJobState | null> {
    const rows = (await this
      .sql`SELECT * FROM ai_jobs WHERE id = ${id}`) as Array<AiJobRow>;
    if (rows.length === 0) return null;
    return this.rowToJob(rows[0]);
  }

  async getJobByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<AiJobState | null> {
    const rows = (await this
      .sql`SELECT * FROM ai_jobs WHERE idempotency_key = ${idempotencyKey}`) as Array<AiJobRow>;
    if (rows.length === 0) return null;
    return this.rowToJob(rows[0]);
  }

  async getActiveJobByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<AiJobState | null> {
    const rows = (await this.sql`
      SELECT *
      FROM ai_jobs
      WHERE idempotency_key = ${idempotencyKey}
        AND status IN ('queued', 'running')
      ORDER BY updated_at DESC
      LIMIT 1
    `) as Array<AiJobRow>;
    if (rows.length === 0) return null;
    return this.rowToJob(rows[0]);
  }

  async listJobs(provider?: string, status?: string): Promise<AiJobState[]> {
    const rows = (await this.sql`
      SELECT * FROM ai_jobs
      WHERE 1=1
      ${provider ? this.sql`AND provider = ${provider}` : this.sql``}
      ${status ? this.sql`AND status = ${status}` : this.sql``}
      ORDER BY created_at DESC
    `) as AiJobRow[];

    return Promise.all(rows.map((row) => this.rowToJob(row)));
  }

  async markStaleRunningJobsAsFailed(
    staleThresholdMs: number = 300000,
  ): Promise<number> {
    const cutoff = new Date(Date.now() - staleThresholdMs);

    const result = await this.sql`
            UPDATE ai_jobs
            SET status = 'failed',
                error = 'Job stuck in running state (server restart)',
                error_code = 'server_restart',
                retryable = true,
                updated_at = now()
            WHERE status = 'running' AND updated_at < ${cutoff}
        `;
    return result.count ?? 0;
  }

  async getJobEvents(jobId: string): Promise<AiJobEvent[]> {
    const rows = (await this.sql`
            SELECT seq, ts, event, data
            FROM job_events
            WHERE job_id = ${jobId}
            ORDER BY seq ASC
        `) as Array<{
      seq: number;
      ts: Date;
      event: string;
      data: Record<string, unknown> | null;
    }>;

    return rows.map((row) => ({
      seq: row.seq,
      ts: row.ts.getTime(),
      event: row.event,
      data: row.data ?? undefined,
    }));
  }

  async persistTransition(job: AiJobState, event: AiJobEvent): Promise<void> {
    await this.sql.begin(async (tx) => {
      await tx`
                INSERT INTO ai_jobs (
                    id, idempotency_key, status, provider,
                    input_json, output_json, usage_json, editorial_patch_json,
                    validation_report_json, can_publish, pipeline_severity, pipeline_score, pipeline_stage,
                    error, error_code, retryable,
                    created_at, updated_at
                ) VALUES (
                    ${job.id}, ${job.idempotencyKey}, ${job.status}, ${job.input.provider},
                    ${job.input}, ${job.output ? job.output : null}, ${job.usage ? job.usage : null}, ${job.editorialPatch ? job.editorialPatch : null},
                    ${job.validationReport ? job.validationReport : null}, ${job.canPublish !== undefined ? job.canPublish : null}, ${job.pipelineSeverity ?? null}, ${job.pipelineScore ?? null}, ${job.pipelineStage ?? null},
                    ${job.error ?? null}, ${job.errorCode ?? null}, ${job.retryable !== undefined ? job.retryable : null},
                    ${new Date(job.createdAt)}, ${new Date(job.updatedAt)}
                )
                ON CONFLICT(id) DO UPDATE SET
                    status = EXCLUDED.status,
                    provider = EXCLUDED.provider,
                    input_json = EXCLUDED.input_json,
                    output_json = EXCLUDED.output_json,
                    usage_json = EXCLUDED.usage_json,
                    editorial_patch_json = EXCLUDED.editorial_patch_json,
                    validation_report_json = EXCLUDED.validation_report_json,
                    can_publish = EXCLUDED.can_publish,
                    pipeline_severity = EXCLUDED.pipeline_severity,
                    pipeline_score = EXCLUDED.pipeline_score,
                    pipeline_stage = EXCLUDED.pipeline_stage,
                    error = EXCLUDED.error,
                    error_code = EXCLUDED.error_code,
                    retryable = EXCLUDED.retryable,
                    updated_at = EXCLUDED.updated_at
            `;

      await tx`
                INSERT INTO job_events (job_id, seq, ts, event, data)
                VALUES (${job.id}, ${event.seq}, ${new Date(event.ts)}, ${event.event}, ${event.data ? event.data : null})
            `;
    });
  }

  private async rowToJob(row: AiJobRow): Promise<AiJobState> {
    const events = await this.getJobEvents(row.id);

    return {
      id: row.id,
      input: row.input_json as AiJobInput,
      status: row.status as AiJobStatus,
      idempotencyKey: row.idempotency_key,
      events,
      output: (row.output_json ?? undefined) as ComponentDocOutput | undefined,
      usage: (row.usage_json ?? undefined) as AiUsageMetrics | undefined,
      editorialPatch: (row.editorial_patch_json ?? undefined) as
        | EditorialPatch
        | undefined,
      validationReport: (row.validation_report_json ?? undefined) as
        | ValidationReport
        | undefined,
      canPublish: row.can_publish ?? undefined,
      pipelineSeverity: row.pipeline_severity as
        | 'blocking'
        | 'warning'
        | 'info'
        | undefined,
      pipelineScore: row.pipeline_score ?? undefined,
      pipelineStage: row.pipeline_stage as
        | 'extracting'
        | 'patching'
        | 'validating'
        | undefined,
      error: row.error ?? undefined,
      errorCode: row.error_code ?? undefined,
      retryable: row.retryable ?? undefined,
      createdAt: row.created_at.getTime(),
      updatedAt: row.updated_at.getTime(),
    };
  }
}
