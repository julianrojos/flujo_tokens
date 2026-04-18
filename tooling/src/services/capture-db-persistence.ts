import * as path from 'node:path';

import {
  bootstrapDatabase,
  resolveDashboardDbUrl,
} from '../../../apps/ds-dashboard/server/db/pg-db-service.js';
import { ComponentRepository } from '../../../apps/ds-dashboard/server/db/component-repository.js';
import {
  persistCapturePayloadToComponentRepo,
  persistRegistryEntriesToComponentRepo,
} from '../../../apps/ds-dashboard/server/services/capture-db-persistence-service.js';
import type { ComponentCatalogEntry } from '../../../apps/ds-dashboard/server/db/component-repository.js';

export interface CaptureDbPersistenceResult {
  attempted: number;
  upserted: number;
  skipped: number;
}

export interface RegistryDbPersistenceResult {
  attempted: number;
  upserted: number;
}

function resolveDashboardDatabaseUrl(
  projectRoot: string,
  databaseUrlOverride?: string,
): string {
  void projectRoot;
  const explicit = String(databaseUrlOverride || '').trim();
  if (explicit && explicit.includes('://')) return explicit;
  return resolveDashboardDbUrl(process.env);
}

export async function persistCaptureReportToDb(options: {
  projectRoot: string;
  systemId: string;
  payload: unknown;
  databaseUrl?: string;
}): Promise<CaptureDbPersistenceResult> {
  const { projectRoot, systemId, payload, databaseUrl: databaseUrlOverride } = options;
  const databaseUrl = resolveDashboardDatabaseUrl(projectRoot, databaseUrlOverride);
  let db;
  try {
    db = await bootstrapDatabase(databaseUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[capture-db-persistence] Failed to open DB for system "${systemId}" at "${databaseUrl}": ${message}`,
    );
  }
  try {
    const componentRepo = new ComponentRepository(db);
    return await persistCapturePayloadToComponentRepo({
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
    await db.end();
  }
}

export async function persistRegistryEntriesToDb(options: {
  projectRoot: string;
  systemId: string;
  entries: ComponentCatalogEntry[];
  databaseUrl?: string;
}): Promise<RegistryDbPersistenceResult> {
  const { projectRoot, systemId, entries, databaseUrl: databaseUrlOverride } = options;
  const databaseUrl = resolveDashboardDatabaseUrl(projectRoot, databaseUrlOverride);
  let db;
  try {
    db = await bootstrapDatabase(databaseUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[capture-db-persistence] Failed to open DB for system "${systemId}" at "${databaseUrl}": ${message}`,
    );
  }
  try {
    const componentRepo = new ComponentRepository(db);
    return await persistRegistryEntriesToComponentRepo({
      entries,
      componentRepo,
      systemId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[capture-db-persistence] Failed to persist catalog entries for system "${systemId}": ${message}`,
    );
  } finally {
    await db.end();
  }
}
