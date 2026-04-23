import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDesignSystemRepository } from "../../scripts/lib/system-repository.mjs";
import { resolveDashboardDbUrl } from "../../../apps/ds-dashboard/server/db/pg-db-service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, "../../..");
const systemRepository = createDesignSystemRepository({ repoRoot: PROJECT_ROOT });
let repositoryDisposed = false;
let cachedDesignSystemsConfig: DesignSystemsFile | null = null;

function disposeSystemRepository(): void {
  if (repositoryDisposed) return;
  repositoryDisposed = true;
  try {
    systemRepository.dispose();
  } catch {
    // Ignore shutdown dispose errors.
  }
}

process.once("exit", disposeSystemRepository);
process.once("SIGINT", () => {
  disposeSystemRepository();
  process.exit(130);
});
process.once("SIGTERM", () => {
  disposeSystemRepository();
  process.exit(143);
});

/**
 * Design system configuration structure.
 */
export interface DesignSystemConfig {
  id: string;
  name: string;
  appName?: string;
  figmaFileId?: string;
  figmaApiToken?: string;
  inputDir: string;
  outputDir: string;
  docsDir: string;
  collections: string[];
}

/**
 * Design systems configuration file structure.
 */
export interface DesignSystemsFile {
  systems: DesignSystemConfig[];
  defaultSystem?: string;
}

export const DEFAULT_THEME_PATH = path.resolve(PROJECT_ROOT, "tooling/figma-doc-theme.yml");

function resolveDashboardDatabaseUrl(): string {
  return resolveDashboardDbUrl(process.env);
}

export interface ScriptSystemContext {
  id: string;
  name: string;
  docsDir: string;
  paths: {
    input: string;
    output: string;
    generated: string;
    specs: string;
    docs: string;
    databaseUrl: string;
  };
}

/**
 * Create a system context object with the given system config.
 */
function systemContext(system: DesignSystemConfig): ScriptSystemContext {
  const docsDir = path.resolve(PROJECT_ROOT, system.docsDir);
  return {
    id: system.id,
    name: system.name,
    docsDir,
    paths: {
      input: path.resolve(PROJECT_ROOT, system.inputDir),
      output: path.resolve(PROJECT_ROOT, system.outputDir),
      generated: path.resolve(docsDir, "_generated"),
      specs: path.resolve(docsDir, "_spec/components"),
      docs: path.resolve(docsDir, "components"),
      databaseUrl: resolveDashboardDatabaseUrl(),
    },
  };
}

/**
 * Resolve canonical design-system directories by convention.
 */
function deriveSystemDirs(systemId: string): { inputDir: string; outputDir: string; docsDir: string } {
  const baseDir = path.join("design-systems", systemId);
  return {
    inputDir: path.join(baseDir, "input"),
    outputDir: path.join(baseDir, "output"),
    docsDir: path.join(baseDir, "docs"),
  };
}

function toDesignSystemConfig(system: {
  id: string;
  name: string;
  appName?: string;
  figmaFileId?: string;
  figmaApiToken?: string;
  collections?: string[];
}): DesignSystemConfig {
  const dirs = deriveSystemDirs(system.id);
  return {
    id: system.id,
    name: system.name,
    appName: system.appName,
    figmaFileId: system.figmaFileId,
    figmaApiToken: system.figmaApiToken,
    inputDir: dirs.inputDir,
    outputDir: dirs.outputDir,
    docsDir: dirs.docsDir,
    collections: Array.isArray(system.collections) ? system.collections : [],
  };
}

/**
 * Load design systems configuration from DB (single source of truth).
 */
export async function loadDesignSystemsConfigAsync(): Promise<DesignSystemsFile> {
  try {
    const rawSystems = await systemRepository.getAll();
    const systems = rawSystems.map(toDesignSystemConfig);
    const defaultRaw = await systemRepository.getDefaultSystemId();
    const defaultSystem = defaultRaw || (systems.length > 0 ? systems[0].id : undefined);
    const config = { systems, defaultSystem };
    cachedDesignSystemsConfig = config;
    return config;
  } catch (err) {
    throw new Error(
      `Cannot load design systems from DB: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Sync compatibility accessor.
 * Requires an async preload call before using the sync API.
 */
export function loadDesignSystemsConfig(): DesignSystemsFile {
  if (cachedDesignSystemsConfig) {
    return cachedDesignSystemsConfig;
  }
  throw new Error(
    'Design systems config is not preloaded. Call loadDesignSystemsConfigAsync() first ' +
      'or switch to resolveSystemContextSafeAsync().'
  );
}

/**
 * Resolve system context from the central repository.
 * Returns the active system context based on defaultSystem or explicit system ID.
 * Throws when no design systems are configured.
 */
function resolveSystemContextFromConfig(
  config: DesignSystemsFile,
  opts?: { system?: string },
): ScriptSystemContext {
  const systems = Array.isArray(config.systems) ? config.systems : [];
  if (systems.length === 0) {
    throw new Error("No systems configured. Create one first.");
  }
  const systemId = String(opts?.system || config.defaultSystem || "").trim();

  // Try to find requested system or default
  if (systemId) {
    const system = systems.find((s) => s.id === systemId);
    if (system) {
      return systemContext(system);
    }
    const available = systems.map((s) => s.id).filter(Boolean).join(", ");
    throw new Error(`Unknown system: "${systemId}". Available: ${available || "none"}`);
  }

  return systemContext(systems[0]);
}

/**
 * Resolve system context from DB asynchronously.
 */
export async function resolveSystemContextSafeAsync(
  opts?: { system?: string },
): Promise<ScriptSystemContext> {
  const config = await loadDesignSystemsConfigAsync();
  return resolveSystemContextFromConfig(config, opts);
}

/**
 * Sync compatibility accessor.
 * Requires an async preload call before using the sync API.
 */
export function resolveSystemContextSafe(opts?: { system?: string }): ScriptSystemContext {
  return resolveSystemContextFromConfig(loadDesignSystemsConfig(), opts);
}

/**
 * Get the default system context for module-level usage.
 */
export function getDefaultSystemContext(): ScriptSystemContext {
  return resolveSystemContextSafe();
}
