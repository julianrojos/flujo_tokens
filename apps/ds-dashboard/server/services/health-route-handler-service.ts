import type { Context } from 'hono';

import {
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
  getSystemContext: (
    systemHeader: string,
  ) => SystemContext | Promise<SystemContext>;
  healthRepo?: import('../db/health-repository.js').HealthRepository;
}

function buildMissingRepoError(c: Context, deps: HealthRouteHandlerDeps) {
  return deps.failJson(c, 500, {
    code: 'internal.health_repo_missing',
    userMessage: 'Health repository is not initialized.',
    recoverable: false,
  });
}

export async function handleHealthHistoryRoute(
  c: Context,
  deps: HealthRouteHandlerDeps,
): Promise<any> {
  const { getSystemContext, healthRepo } = deps;
  if (!healthRepo) return buildMissingRepoError(c, deps);
  const sysCtx = await getSystemContext(c.req.header('x-ds-system') ?? '');
  const range = normalizeHealthHistoryRange(c.req.query('range'));

  const rows = await healthRepo.getHistory(sysCtx.systemId, undefined, 500);
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
