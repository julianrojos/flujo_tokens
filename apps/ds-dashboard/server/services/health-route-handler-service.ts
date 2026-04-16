import type { Context } from 'hono';

import {
  buildEmptyTokenHealthReport,
  filterSnapshotsByRange,
  normalizeHealthHistoryRange,
} from './health-artifacts-service.ts';

type SystemContext = {
  systemId: string;
};

export interface HealthRouteHandlerDeps {
  failJson: (
    c: Context,
    statusCode: number,
    args: Record<string, unknown>,
  ) => any;
  getSystemContext: (systemHeader: string) => SystemContext;
  healthRepo?: import('../db/health-repository.js').HealthRepository;
}

function buildMissingRepoError(c: Context, deps: HealthRouteHandlerDeps) {
  return deps.failJson(c, 500, {
    code: 'internal.health_repo_missing',
    userMessage: 'Health repository is not initialized.',
    recoverable: false,
  });
}

export async function handleTokenHealthRoute(
  c: Context,
  deps: HealthRouteHandlerDeps,
): Promise<any> {
  const { getSystemContext, healthRepo } = deps;
  if (!healthRepo) return buildMissingRepoError(c, deps);
  const sysCtx = getSystemContext(c.req.header('x-ds-system') ?? '');
  const snapshot = healthRepo.getSnapshot(sysCtx.systemId, 'tokens');
  if (snapshot) return c.json(snapshot.snapshotJson);
  return c.json(
    buildEmptyTokenHealthReport({
      systemId: sysCtx.systemId,
      reason:
        'Token health snapshot not found in database. Run refresh-token-health first.',
    }),
  );
}

export async function handleHealthHistoryRoute(
  c: Context,
  deps: HealthRouteHandlerDeps,
): Promise<any> {
  const { getSystemContext, healthRepo } = deps;
  if (!healthRepo) return buildMissingRepoError(c, deps);
  const sysCtx = getSystemContext(c.req.header('x-ds-system') ?? '');
  const range = normalizeHealthHistoryRange(c.req.query('range'));

  const rows = healthRepo.getHistory(sysCtx.systemId, undefined, 500);
  const snapshots = rows
    .map((row) => row.entryJson)
    .filter((entry) =>
      Boolean(entry && typeof entry === 'object' && 'captured_at' in entry),
    ) as Array<Record<string, unknown>>;
  const filtered = filterSnapshotsByRange(snapshots as never, range);

  return c.json({
    ok: true,
    schema_version: 1,
    generated_at: new Date().toISOString(),
    retention_days: 90,
    snapshots: filtered,
    summary: {
      snapshots_total: filtered.length,
      latest_at: filtered.length
        ? String(
            (filtered[filtered.length - 1] as Record<string, unknown>)
              .captured_at || null,
          )
        : null,
    },
    range,
  });
}
