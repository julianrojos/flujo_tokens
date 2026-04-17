import path from "node:path";
import { tsImport } from "tsx/esm/api";

const source = await tsImport("../../../apps/ds-dashboard/server/db/design-system-repository.ts", import.meta.url);
const dbSource = await tsImport("../../../apps/ds-dashboard/server/db/pg-db-service.ts", import.meta.url);
const utilsSource = await tsImport("../../../apps/ds-dashboard/server/lib/system-utils.ts", import.meta.url);

const { DesignSystemRepository } = source;
const { bootstrapDatabase, resolveDashboardDbUrl } = dbSource;

export function createDesignSystemRepository(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || process.cwd());
  void repoRoot;
  let statePromise = null;

  const getState = () => {
    if (!statePromise) {
      statePromise = (async () => {
        const db = await bootstrapDatabase({ databaseUrl: resolveDashboardDbUrl(process.env) });
        const repository = new DesignSystemRepository(db, repoRoot);
        return { db, repository };
      })();
    }
    return statePromise;
  };

  const lazyCall = (methodName, args = []) =>
    getState().then(({ repository }) => repository[methodName](...args));

  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "dispose") {
          return async () => {
            if (!statePromise) return;
            const { repository, db } = await statePromise;
            const originalDispose =
              typeof repository.dispose === "function"
                ? repository.dispose.bind(repository)
                : () => {};
            originalDispose();
            try {
              await db.end();
            } catch {
              // Ignore double-close or shutdown race.
            }
          };
        }

        if (typeof prop !== "string") return undefined;
        return (...args) => lazyCall(prop, args);
      },
    },
  );
}

export const normalizeSystemId = utilsSource.normalizeSystemId;
export const normalizeCollectionList = utilsSource.normalizeCollectionList;
export const ensureRelativeDir = utilsSource.ensureRelativeDir;
export const normalizeFigmaApiTokenRef = utilsSource.normalizeFigmaApiTokenRef;
export const resolveSafeSystemPathsForDeletion = utilsSource.resolveSafeSystemPathsForDeletion;
export const summarizeDesignSystemsConfig = utilsSource.summarizeDesignSystemsConfig;
