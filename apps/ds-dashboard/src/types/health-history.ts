export type HealthHistoryRange = "7d" | "30d" | "90d";

export type HealthHistoryBucket = "day" | "week";

export interface HealthHistorySnapshotMetrics {
  breaking_changes: number | null;
  wcag_failures_total: number;
  coverage_avg: number;
  unresolved_total: number;
  unused_tokens_total: number;
  needs_review_total: number;
}

export interface HealthHistorySnapshot {
  captured_at: string;
  metrics: HealthHistorySnapshotMetrics;
  fingerprints: {
    token_health: string;
    components_health: string;
    token_usage: string;
    token_diff: string;
    signature_sha256: string;
  };
  meta: {
    before_ref: string;
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

export interface CaptureHealthSnapshotResult {
  ok: boolean;
  dry_run?: boolean;
  out_json?: string;
  appended?: boolean;
  deduplicated_same_day?: boolean;
  pruned_old_snapshots?: number;
  snapshots_total?: number;
  changed?: boolean;
  written?: boolean;
  snapshot?: HealthHistorySnapshot;
  warnings?: string[];
  message?: string;
}
