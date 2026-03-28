import path from "node:path";
import fs from "node:fs";
import { tsImport } from "tsx/esm/api";

const source = await tsImport("../../../apps/ds-dashboard/server/db/design-system-repository.ts", import.meta.url);
const dbSource = await tsImport("../../../apps/ds-dashboard/server/db/db-service.ts", import.meta.url);
const utilsSource = await tsImport("../../../apps/ds-dashboard/server/lib/system-utils.ts", import.meta.url);

const { DesignSystemRepository } = source;
const { bootstrapDatabase } = dbSource;

export function createDesignSystemRepository(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || process.cwd());
  const dbPath = path.join(repoRoot, "apps/ds-dashboard/server/db/ds-dashboard.db");
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  const db = bootstrapDatabase({ dbPath });
  const repository = new DesignSystemRepository(db, { repoRoot });
  const originalDispose = typeof repository.dispose === "function" ? repository.dispose.bind(repository) : () => {};
  repository.dispose = () => {
    originalDispose();
    try {
      db.close();
    } catch {
      // Ignore double-close or shutdown race.
    }
  };
  return repository;
}

export const normalizeSystemId = utilsSource.normalizeSystemId;
export const normalizeCollectionList = utilsSource.normalizeCollectionList;
export const ensureRelativeDir = utilsSource.ensureRelativeDir;
export const normalizeFigmaApiTokenRef = utilsSource.normalizeFigmaApiTokenRef;
export const resolveSafeSystemPathsForDeletion = utilsSource.resolveSafeSystemPathsForDeletion;
export const summarizeDesignSystemsConfig = utilsSource.summarizeDesignSystemsConfig;
