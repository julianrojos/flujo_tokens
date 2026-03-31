import * as path from 'node:path';

import { bootstrapDatabase } from '../../../apps/ds-dashboard/server/db/db-service.js';
import { ComponentRepository } from '../../../apps/ds-dashboard/server/db/component-repository.js';
import {
  persistCapturePayloadToComponentRepo,
  persistRegistryEntriesToComponentRepo,
} from '../../../apps/ds-dashboard/server/services/capture-db-persistence-service.js';
import type { ComponentRegistryEntry } from '../../../apps/ds-dashboard/server/db/component-repository.js';

export interface CaptureDbPersistenceResult {
  attempted: number;
  upserted: number;
  skipped: number;
}

export interface RegistryDbPersistenceResult {
  attempted: number;
  upserted: number;
}

function resolveDashboardDbPath(projectRoot: string, dbPathOverride?: string): string {
  const explicit = String(dbPathOverride || '').trim();
  if (explicit) return path.resolve(explicit);

  const envPath = String(process.env.DS_DASHBOARD_DB_PATH || '').trim();
  if (envPath) return path.resolve(envPath);

  return path.join(
    projectRoot,
    'apps',
    'ds-dashboard',
    'server',
    'db',
    'ds-dashboard.db',
  );
}

export function persistCaptureReportToDb(options: {
  projectRoot: string;
  systemId: string;
  payload: unknown;
  dbPath?: string;
}): CaptureDbPersistenceResult {
  const { projectRoot, systemId, payload, dbPath: dbPathOverride } = options;
  const dbPath = resolveDashboardDbPath(projectRoot, dbPathOverride);
  let db;
  try {
    db = bootstrapDatabase({ dbPath });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[capture-db-persistence] Failed to open DB for system "${systemId}" at "${dbPath}": ${message}`,
    );
  }
  try {
    const componentRepo = new ComponentRepository(db);
    return persistCapturePayloadToComponentRepo({
      payload,
      componentRepo,
      systemId,
      repoRoot: projectRoot,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[capture-db-persistence] Failed to persist capture payload for system "${systemId}": ${message}`,
    );
  } finally {
    db.close();
  }
}

export function persistRegistryEntriesToDb(options: {
  projectRoot: string;
  systemId: string;
  entries: ComponentRegistryEntry[];
  dbPath?: string;
}): RegistryDbPersistenceResult {
  const { projectRoot, systemId, entries, dbPath: dbPathOverride } = options;
  const dbPath = resolveDashboardDbPath(projectRoot, dbPathOverride);
  let db;
  try {
    db = bootstrapDatabase({ dbPath });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[capture-db-persistence] Failed to open DB for system "${systemId}" at "${dbPath}": ${message}`,
    );
  }
  try {
    const componentRepo = new ComponentRepository(db);
    return persistRegistryEntriesToComponentRepo({
      entries,
      componentRepo,
      systemId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[capture-db-persistence] Failed to persist registry entries for system "${systemId}": ${message}`,
    );
  } finally {
    db.close();
  }
}
