export type HealthHistoryRange = '7d' | '30d' | '90d';

export type HealthHistoryBucket = 'day' | 'week';

export interface HealthHistorySnapshotMetrics {
  breaking_changes: number | null;
  wcag_failures_total: number;
  unresolved_total: number;
  unused_tokens_total: number;
}

export interface HealthHistorySnapshot {
  captured_at: string;
  metrics: HealthHistorySnapshotMetrics;
  fingerprints: {
    token_usage: string;
    token_diff: string;
    signature_sha256: string;
  };
  meta: {
    before_ref: string;
    diff_available?: boolean;
  };
}

export interface HealthHistoryReport {
  ok: boolean;
  schema_version: number;
  generated_at: string;
  retention_days: number;
  snapshots: HealthHistorySnapshot[];
  summary: {
    snapshots_total: number;
    latest_at: string | null;
  };
}
