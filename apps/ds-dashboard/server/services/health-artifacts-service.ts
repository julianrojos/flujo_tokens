/**
 * Health Artifacts Service
 *
 * Provides utilities for health report artifacts.
 * Migrated from apps/ds-dashboard/server/services/health-artifacts-service.mjs
 */

export interface EmptyTokenHealthReportArgs {
  systemId: string;
  reason?: string;
}

export interface EmptyComponentsHealthReportArgs {
  systemId: string;
}

export interface TokenHealthReport {
  ok: boolean;
  bootstrapped: boolean;
  schema_version: number;
  generated_at: string;
  source: {
    registry_path: string;
    usage_index_path: string;
    graph_viz_path: string;
    wcag_pairs_path: string;
  };
  thresholds: {
    high_usage_threshold: number;
    high_indegree_threshold: number;
  };
  summary: {
    tokens_total: number;
    tokens_with_usage: number;
    unused_tokens_total: number;
    high_coupling_tokens_total: number;
    broken_aliases_total: number;
    broken_css_var_refs_total: number;
    cycle_nodes_total: number;
    wcag_pairs_configured_total: number;
    wcag_pairs_resolved_total: number;
    wcag_failures_total: number;
  };
  warnings: Array<{ id: string; message: string }>;
  unused_tokens: { items: unknown[]; total: number; truncated: boolean };
  high_coupling_tokens: { items: unknown[]; total: number; truncated: boolean };
  broken_aliases: { items: unknown[]; total: number; truncated: boolean };
  broken_css_var_refs: { items: unknown[]; total: number; truncated: boolean };
  wcag_failures: { items: unknown[]; total: number; truncated: boolean };
  upstream_fingerprints: {
    token_usage_index: string;
    token_graph_viz: string;
  };
  fingerprint_sha256: string;
  hint: string;
}

export interface ComponentsHealthReport {
  ok: boolean;
  bootstrapped: boolean;
  schema_version: number;
  source: {
    registry_path: string;
  };
  summary: {
    total_components: number;
    with_spec: number;
    without_spec: number;
    average_coverage_percent: number;
  };
  filters: {
    without_spec: { items: unknown[]; total: number; truncated: boolean };
  };
  components: unknown[];
  fingerprint_sha256: string;
}

export interface HealthHistoryPayload {
  schema_version?: number;
  snapshots?: Array<{
    captured_at?: string;
    metrics?: Record<string, unknown>;
    fingerprints?: Record<string, unknown>;
    meta?: Record<string, unknown>;
  }>;
  generated_at?: string;
  retention_days?: number;
}

export interface NormalizedHealthHistoryPayload {
  ok: boolean;
  schema_version: number;
  generated_at: string;
  retention_days: number;
  snapshots: Array<{
    captured_at: string;
    metrics: {
      breaking_changes: number | null;
      wcag_failures_total: number;
      coverage_avg: number;
      unresolved_total: number;
      unused_tokens_total: number;
      without_spec_total: number;
    };
    fingerprints: {
      token_health: string;
      components_health: string;
      token_usage: string;
      token_diff: string;
      signature_sha256: string;
    };
    meta: {
      before_ref: string;
      diff_available?: boolean;
    };
  }>;
  summary: {
    snapshots_total: number;
    latest_at: string | null;
  };
}

/**
 * Build empty token health report for bootstrap state.
 */
export function buildEmptyTokenHealthReport(args: EmptyTokenHealthReportArgs): TokenHealthReport {
  const warnings = args.reason ? [{ id: 'bootstrap-missing', message: String(args.reason) }] : [];
  return {
    ok: false,
    bootstrapped: true,
    schema_version: 1,
    generated_at: new Date().toISOString(),
    source: {
      registry_path: `db://tokens/${args.systemId}`,
      usage_index_path: `db://token_usage_occurrences/${args.systemId}`,
      graph_viz_path: `db://token_graph/${args.systemId}`,
      wcag_pairs_path: 'config://tooling/config/wcag-pairs.json',
    },
    thresholds: {
      high_usage_threshold: 25,
      high_indegree_threshold: 15,
    },
    summary: {
      tokens_total: 0,
      tokens_with_usage: 0,
      unused_tokens_total: 0,
      high_coupling_tokens_total: 0,
      broken_aliases_total: 0,
      broken_css_var_refs_total: 0,
      cycle_nodes_total: 0,
      wcag_pairs_configured_total: 0,
      wcag_pairs_resolved_total: 0,
      wcag_failures_total: 0,
    },
    warnings,
    unused_tokens: { items: [], total: 0, truncated: false },
    high_coupling_tokens: { items: [], total: 0, truncated: false },
    broken_aliases: { items: [], total: 0, truncated: false },
    broken_css_var_refs: { items: [], total: 0, truncated: false },
    wcag_failures: { items: [], total: 0, truncated: false },
    upstream_fingerprints: {
      token_usage_index: '',
      token_graph_viz: '',
    },
    fingerprint_sha256: '',
    hint: 'Token health is not available yet. Capture components and token inputs first, then run token health.',
  };
}

/**
 * Build empty components health report for bootstrap state.
 */
export function buildEmptyComponentsHealthReport(args: EmptyComponentsHealthReportArgs): ComponentsHealthReport {
  return {
    ok: false,
    bootstrapped: true,
    schema_version: 2,
    source: {
      registry_path: `db://components/${args.systemId}`,
    },
    summary: {
      total_components: 0,
      with_spec: 0,
      without_spec: 0,
      average_coverage_percent: 0,
    },
    filters: {
      without_spec: { items: [], total: 0, truncated: false },
    },
    components: [],
    fingerprint_sha256: '',
  };
}

/**
 * Normalize health history range parameter.
 */
export function normalizeHealthHistoryRange(raw: unknown): string {
  const value = String(raw || '').trim().toLowerCase();
  if (value === '7d' || value === '90d') return value;
  return '30d';
}

function rangeDays(range: string): number {
  if (range === '7d') return 7;
  if (range === '90d') return 90;
  return 30;
}

/**
 * Normalize health history payload.
 */
export function normalizeHealthHistoryPayload(raw: unknown): NormalizedHealthHistoryPayload {
  const base = raw && typeof raw === 'object' ? (raw as HealthHistoryPayload) : {};
  const rawSnapshots = Array.isArray(base.snapshots) ? base.snapshots : [];
  const snapshots: NormalizedHealthHistoryPayload['snapshots'] = [];

  for (const item of rawSnapshots) {
    if (!item || typeof item !== 'object') continue;
    const capturedAt = String(item.captured_at || '').trim();
    if (!capturedAt) continue;

    const metrics = item.metrics && typeof item.metrics === 'object' ? item.metrics : {};
    const fingerprints =
      item.fingerprints && typeof item.fingerprints === 'object' ? item.fingerprints : {};
    const meta = item.meta && typeof item.meta === 'object' ? item.meta : {};

    snapshots.push({
      captured_at: capturedAt,
      metrics: {
        breaking_changes:
          metrics.breaking_changes === null
            ? null
            : Number.isFinite(Number(metrics.breaking_changes))
              ? Number(metrics.breaking_changes)
              : null,
        wcag_failures_total: Number(metrics.wcag_failures_total || 0),
        coverage_avg: Number(metrics.coverage_avg || 0),
        unresolved_total: Number(metrics.unresolved_total || 0),
        unused_tokens_total: Number(metrics.unused_tokens_total || 0),
        without_spec_total: Number(metrics.without_spec_total || 0),
      },
      fingerprints: {
        token_health: String(fingerprints.token_health || ''),
        components_health: String(fingerprints.components_health || ''),
        token_usage: String(fingerprints.token_usage || ''),
        token_diff: String(fingerprints.token_diff || ''),
        signature_sha256: String(fingerprints.signature_sha256 || ''),
      },
      meta: {
        before_ref: String(meta.before_ref || 'HEAD~1'),
        diff_available:
          typeof (meta as Record<string, unknown>).diff_available === 'boolean'
            ? ((meta as Record<string, unknown>).diff_available as boolean)
            : undefined,
      },
    });
  }

  snapshots.sort((left, right) => left.captured_at.localeCompare(right.captured_at));
  return {
    ok: true,
    schema_version: Number(base.schema_version || 1),
    generated_at: String(base.generated_at || new Date().toISOString()),
    retention_days: Number(base.retention_days || 120),
    snapshots,
    summary: {
      snapshots_total: snapshots.length,
      latest_at: snapshots.length ? snapshots[snapshots.length - 1].captured_at : null,
    },
  };
}

/**
 * Filter snapshots by range.
 */
export function filterSnapshotsByRange(
  snapshots: Array<{ captured_at: string }>,
  range: string
): Array<{ captured_at: string }> {
  const days = rangeDays(range);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return snapshots.filter((snapshot) => {
    const epoch = new Date(snapshot.captured_at).getTime();
    return Number.isFinite(epoch) && epoch >= cutoff;
  });
}
