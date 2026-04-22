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
      unresolved_total: number;
      unused_tokens_total: number;
    };
    fingerprints: {
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
 * Normalize health history range parameter.
 */
export function normalizeHealthHistoryRange(raw: unknown): string {
  const value = String(raw || '')
    .trim()
    .toLowerCase();
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
export function normalizeHealthHistoryPayload(
  raw: unknown,
): NormalizedHealthHistoryPayload {
  const base =
    raw && typeof raw === 'object' ? (raw as HealthHistoryPayload) : {};
  const rawSnapshots = Array.isArray(base.snapshots) ? base.snapshots : [];
  const snapshots: NormalizedHealthHistoryPayload['snapshots'] = [];

  for (const item of rawSnapshots) {
    if (!item || typeof item !== 'object') continue;
    const capturedAt = String(item.captured_at || '').trim();
    if (!capturedAt) continue;

    const metrics =
      item.metrics && typeof item.metrics === 'object' ? item.metrics : {};
    const fingerprints =
      item.fingerprints && typeof item.fingerprints === 'object'
        ? item.fingerprints
        : {};
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
        unresolved_total: Number(metrics.unresolved_total || 0),
        unused_tokens_total: Number(metrics.unused_tokens_total || 0),
      },
      fingerprints: {
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

  snapshots.sort((left, right) =>
    left.captured_at.localeCompare(right.captured_at),
  );
  return {
    ok: true,
    schema_version: Number(base.schema_version || 1),
    generated_at: String(base.generated_at || new Date().toISOString()),
    retention_days: Number(base.retention_days || 120),
    snapshots,
    summary: {
      snapshots_total: snapshots.length,
      latest_at: snapshots.length
        ? snapshots[snapshots.length - 1].captured_at
        : null,
    },
  };
}

/**
 * Filter snapshots by range.
 */
export function filterSnapshotsByRange(
  snapshots: Array<{ captured_at: string }>,
  range: string,
): Array<{ captured_at: string }> {
  const days = rangeDays(range);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return snapshots.filter((snapshot) => {
    const epoch = new Date(snapshot.captured_at).getTime();
    return Number.isFinite(epoch) && epoch >= cutoff;
  });
}
