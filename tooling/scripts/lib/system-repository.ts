/**
 * TypeScript implementation of the design-system repository bridge.
 *
 * Backed by PostgreSQL via apps/ds-dashboard/server/db/design-system-repository.ts
 */

import path from "node:path";
import { tsImport } from "tsx/esm/api";

type RepositoryModule = {
  DesignSystemRepository: new (db: unknown, repoRoot: string) => {
    dispose?: () => void | Promise<void>;
    [key: string]: unknown;
  };
};

type DbModule = {
  bootstrapDatabase: (args: { databaseUrl: string }) => Promise<unknown>;
  resolveDashboardDbUrl: (env: NodeJS.ProcessEnv) => string;
};

type UtilsModule = {
  normalizeSystemId: (value: string) => string;
  normalizeCollectionList: (value: unknown) => unknown;
  ensureRelativeDir: (value: string) => string;
  normalizeFigmaApiTokenRef: (value: string) => string;
  resolveSafeSystemPathsForDeletion: (args: unknown) => unknown;
  summarizeDesignSystemsConfig: (args: unknown) => unknown;
};

const source = (await tsImport(
  "../../../apps/ds-dashboard/server/db/design-system-repository.ts",
  import.meta.url,
)) as RepositoryModule;
const dbSource = (await tsImport(
  "../../../apps/ds-dashboard/server/db/pg-db-service.ts",
  import.meta.url,
)) as DbModule;
const utilsSource = (await tsImport(
  "../../../apps/ds-dashboard/server/lib/system-utils.ts",
  import.meta.url,
)) as UtilsModule;

export interface DesignSystemConfigEntry {
  id: string;
  name: string;
  appName?: string;
  figmaFileId?: string;
  figmaApiToken?: string;
  collections?: string[];
  [key: string]: unknown;
}

export interface DesignSystemsConfig {
  systems: DesignSystemConfigEntry[];
  defaultSystem: string;
  [key: string]: unknown;
}

export interface ScriptSystemContext extends DesignSystemConfigEntry {
  paths: {
    input: string;
    output: string;
    generated: string;
    specs: string;
    docs: string;
    registry: string;
  };
}

export interface DesignSystemRepository {
  getAll(): DesignSystemConfigEntry[];
  getById(id: string): DesignSystemConfigEntry | null;
  create(entry: DesignSystemConfigEntry): DesignSystemConfigEntry;
  update(id: string, patch: Partial<DesignSystemConfigEntry>): DesignSystemConfigEntry | null;
  delete(id: string): boolean;
  getDefaultSystemId(): string | null;
  setDefaultSystemId(id: string | null): void;
  getConfig(): DesignSystemsConfig;
  resolveSystemContext(systemId: string | undefined): ScriptSystemContext;
  dispose(): void;
}

export interface DesignSystemRepositoryOptions {
  repoRoot: string;
}

export function createDesignSystemRepository(
  options: DesignSystemRepositoryOptions,
): DesignSystemRepository {
  const repoRoot = path.resolve(options.repoRoot || process.cwd());
  let statePromise:
    | Promise<{ db: unknown; repository: DesignSystemRepository }>
    | null = null;

  const getState = () => {
    if (!statePromise) {
      statePromise = (async () => {
        const db = await dbSource.bootstrapDatabase({
          databaseUrl: dbSource.resolveDashboardDbUrl(process.env),
        });
        const repository = new source.DesignSystemRepository(db, repoRoot) as DesignSystemRepository;
        return { db, repository };
      })();
    }
    return statePromise;
  };

  const lazyCall = (methodName: string, args: unknown[] = []) =>
    getState().then(({ repository }) =>
      (repository as Record<string, (...callArgs: unknown[]) => unknown>)[methodName](...args),
    );

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
              const dbHandle = db as { end?: () => Promise<void> };
              await dbHandle.end?.();
            } catch {
              // Ignore double-close or shutdown race.
            }
          };
        }

        if (typeof prop !== "string") return undefined;
        return (...args: unknown[]) => lazyCall(prop, args);
      },
    },
  ) as DesignSystemRepository;
}

export const normalizeSystemId = utilsSource.normalizeSystemId;
export const normalizeCollectionList = utilsSource.normalizeCollectionList;
export const ensureRelativeDir = utilsSource.ensureRelativeDir;
export const normalizeFigmaApiTokenRef = utilsSource.normalizeFigmaApiTokenRef;
export const resolveSafeSystemPathsForDeletion =
  utilsSource.resolveSafeSystemPathsForDeletion;
export const summarizeDesignSystemsConfig = utilsSource.summarizeDesignSystemsConfig;
