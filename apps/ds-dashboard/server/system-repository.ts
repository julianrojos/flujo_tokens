import fsSync, { type FSWatcher } from "node:fs";
import path from "node:path";
import { normalizeEnvRef } from "./lib/env-ref-utils.js";

export type DesignSystemConfigEntry = {
  id: string;
  name?: string;
  appName?: string;
  figmaFileId?: string;
  figmaApiToken?: string;
  inputDir?: string;
  outputDir?: string;
  docsDir?: string;
  collections?: string[];
  compileVariablesOnCapture?: boolean;
  [key: string]: unknown;
};

export type DesignSystemsConfig = {
  systems: DesignSystemConfigEntry[];
  defaultSystem: string;
  [key: string]: unknown;
};

export type DashboardSystemContext = {
  systemId: string;
  repoRoot: string;
  docsDir: string;
  genDir: string;
  componentRegistryPath: string;
  tokenRegistryPath: string;
  tokenGraphVizPath: string;
  tokenUsageIndexPath: string;
  tokenHealthPath: string;
  componentsHealthPath: string;
  healthHistoryPath: string;
  namingDebtCachePath: string;
  namingDebtConfigPath: string;
  specBackupsDirPath: string;
  wcagPairsPath: string;
  tokenDiffScriptPath: string;
  healthSnapshotScriptPath: string;
  captureFromFigmaUrlScriptPath: string;
  tokensFromFigmaScriptPath: string;
  rawConfig: DesignSystemsConfig;
};

export type ScriptSystemContext = DesignSystemConfigEntry & {
  paths: {
    input: string;
    output: string;
    generated: string;
    specs: string;
    docs: string;
    registry: string;
    tokenRegistry: string;
  };
};

const FALLBACK_SYSTEM_ID = "local";
const FALLBACK_SYSTEM_NAME = "Local";
const FALLBACK_INPUT_DIR = "input/local";
const FALLBACK_OUTPUT_DIR = "output/local";
const FALLBACK_DOCS_DIR = "docs";

export type DesignSystemRepositoryOptions = {
  repoRoot: string;
  watch?: boolean;
};

type CacheState = {
  config: DesignSystemsConfig;
  mtimeMs: number;
};

function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function normalizeSystemEntry(raw: unknown): DesignSystemConfigEntry {
  const row = toObject(raw);
  return {
    ...row,
    id: String(row.id || "").trim(),
    name: String(row.name || "").trim(),
    appName: String(row.appName || "").trim(),
    figmaFileId: String(row.figmaFileId || "").trim(),
    figmaApiToken: String(row.figmaApiToken || "").trim(),
    inputDir: String(row.inputDir || "").trim(),
    outputDir: String(row.outputDir || "").trim(),
    docsDir: String(row.docsDir || "").trim(),
    collections: normalizeCollectionList(row.collections),
    compileVariablesOnCapture: row.compileVariablesOnCapture !== false,
  };
}

function coerceConfig(raw: unknown): DesignSystemsConfig {
  const base = toObject(raw);
  const normalizedSystems = Array.isArray(base.systems)
    ? base.systems.map(normalizeSystemEntry).filter((row) => row.id)
    : [];

  const seenSystemIds = new Set<string>();
  const duplicateSystemIds = new Set<string>();
  for (const system of normalizedSystems) {
    if (seenSystemIds.has(system.id)) {
      duplicateSystemIds.add(system.id);
      continue;
    }
    seenSystemIds.add(system.id);
  }
  if (duplicateSystemIds.size > 0) {
    const list = Array.from(duplicateSystemIds)
      .sort((a, b) => a.localeCompare(b))
      .map((id) => `"${id}"`)
      .join(", ");
    throw new Error(`design-systems.json contains duplicate system ids: ${list}`);
  }

  const configuredDefault = String(base.defaultSystem || "").trim();
  const defaultSystem =
    normalizedSystems.length === 0
      ? ""
      : normalizedSystems.some((row) => row.id === configuredDefault)
        ? configuredDefault
        : normalizedSystems[0].id;

  return {
    ...base,
    systems: normalizedSystems,
    defaultSystem,
  };
}

function cloneConfig(config: DesignSystemsConfig): DesignSystemsConfig {
  return JSON.parse(JSON.stringify(config)) as DesignSystemsConfig;
}

export function normalizeSystemId(raw: unknown) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function normalizeCollectionList(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return Array.from(new Set(raw.map((item) => String(item || "").trim()).filter(Boolean)));
}

export function ensureRelativeDir(raw: unknown, fallback: string) {
  const value = String(raw || "").trim() || fallback;
  const normalized = value.replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "..")) return fallback;
  const cleaned = segments.join("/");
  return cleaned || fallback;
}

export function normalizeFigmaApiTokenRef(raw: unknown, fallback = "") {
  return normalizeEnvRef(raw, fallback);
}

export function resolveSafeSystemPathsForDeletion(
  system: DesignSystemConfigEntry | undefined | null,
  repoRoot: string,
  survivingSystems: DesignSystemConfigEntry[],
) {
  function resolveSystemDirCandidates(entry: DesignSystemConfigEntry | undefined | null) {
    const systemId = String(entry?.id || "").trim();
    return [
      String(entry?.inputDir || (systemId ? `input/${systemId}` : "")).trim(),
      String(entry?.outputDir || (systemId ? `output/${systemId}` : "")).trim(),
      String(entry?.docsDir || (systemId ? `docs/${systemId}` : "")).trim(),
    ].filter(Boolean);
  }

  const candidates = resolveSystemDirCandidates(system);
  const rootWithSep = repoRoot.endsWith(path.sep) ? repoRoot : `${repoRoot}${path.sep}`;

  const survivingDirs = new Set(
    survivingSystems.flatMap((nextSystem) =>
      resolveSystemDirCandidates(nextSystem)
        .map((value) => path.resolve(repoRoot, value))
        .filter(Boolean),
    ),
  );

  const safePaths: string[] = [];
  for (const candidate of candidates) {
    const absolute = path.resolve(repoRoot, candidate);
    if (absolute === repoRoot) continue;
    if (!absolute.startsWith(rootWithSep)) continue;
    if (survivingDirs.has(absolute)) continue;
    safePaths.push(absolute);
  }

  return Array.from(new Set(safePaths));
}

export function summarizeDesignSystemsConfig(config: DesignSystemsConfig) {
  return {
    systems: (Array.isArray(config.systems) ? config.systems : []).map((system) => ({
      id: String(system?.id || ""),
      name: String(system?.name || ""),
    })),
    defaultSystem: String(config.defaultSystem || ""),
  };
}

export class DesignSystemRepository {
  private readonly repoRoot: string;
  private readonly configPath: string;
  private readonly watchEnabled: boolean;
  private cache: CacheState | null;
  private watcher: FSWatcher | null;

  constructor(options: DesignSystemRepositoryOptions) {
    this.repoRoot = options.repoRoot;
    this.configPath = path.join(this.repoRoot, "tooling", "config", "design-systems.json");
    this.watchEnabled = options.watch === true;
    this.cache = null;
    this.watcher = null;
    if (this.watchEnabled) this.ensureWatcher();
  }

  getConfigPath() {
    return this.configPath;
  }

  invalidate() {
    this.cache = null;
  }

  private ensureWatcher() {
    if (!this.watchEnabled || this.watcher) return;
    const configDir = path.dirname(this.configPath);
    const configFile = path.basename(this.configPath);

    this.watcher = fsSync.watch(configDir, (_eventType, fileName) => {
      const changed = fileName ? String(fileName) : "";
      if (!changed || changed === configFile) {
        this.invalidate();
      }
    });

    this.watcher.on("error", () => {
      this.invalidate();
      if (this.watcher) {
        this.watcher.close();
        this.watcher = null;
      }
    });
  }

  dispose() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }

  private readFromDisk() {
    const raw = fsSync.readFileSync(this.configPath, "utf8");
    const parsed = coerceConfig(JSON.parse(raw));
    const stat = fsSync.statSync(this.configPath);
    return {
      config: parsed,
      mtimeMs: stat.mtimeMs,
    };
  }

  getConfig(options?: { forceRefresh?: boolean }) {
    this.ensureWatcher();

    const forceRefresh = options?.forceRefresh === true;
    if (!forceRefresh && this.cache) {
      const currentMtime = fsSync.statSync(this.configPath).mtimeMs;
      if (currentMtime === this.cache.mtimeMs) {
        return cloneConfig(this.cache.config);
      }
    }

    const next = this.readFromDisk();
    this.cache = next;
    return cloneConfig(next.config);
  }

  saveConfig(nextConfig: DesignSystemsConfig) {
    const normalized = coerceConfig(nextConfig);
    const targetPath = this.configPath;
    const tmpPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
    fsSync.writeFileSync(tmpPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
    fsSync.renameSync(tmpPath, targetPath);
    const mtimeMs = fsSync.statSync(targetPath).mtimeMs;
    this.cache = {
      config: normalized,
      mtimeMs,
    };
    return cloneConfig(normalized);
  }

  private resolveSystemEntry(config: DesignSystemsConfig, requestedSystemId?: string) {
    const systems = Array.isArray(config.systems) ? config.systems : [];
    if (systems.length === 0) {
      return {
        id: FALLBACK_SYSTEM_ID,
        name: FALLBACK_SYSTEM_NAME,
        inputDir: FALLBACK_INPUT_DIR,
        outputDir: FALLBACK_OUTPUT_DIR,
        docsDir: FALLBACK_DOCS_DIR,
        compileVariablesOnCapture: true,
      } satisfies DesignSystemConfigEntry;
    }

    const requested = String(requestedSystemId || "").trim();
    if (requested) {
      const direct = systems.find((row) => String(row?.id || "").trim() === requested);
      if (direct) return direct;
    }

    const configuredDefault = String(config.defaultSystem || "").trim();
    if (configuredDefault) {
      const fallback = systems.find((row) => String(row?.id || "").trim() === configuredDefault);
      if (fallback) return fallback;
    }

    return systems[0] || null;
  }

  resolveSystemContext(systemId: string | undefined): ScriptSystemContext {
    const config = this.getConfig();
    const system = this.resolveSystemEntry(config, systemId);
    if (!system) {
      const requested = String(systemId || "").trim() || String(config.defaultSystem || "");
      const available = Array.isArray(config.systems)
        ? config.systems.map((row) => String(row?.id || "").trim()).filter(Boolean).join(", ")
        : "";
      if (!requested) {
        throw new Error("No design systems configured.");
      }
      throw new Error(`Unknown system: "${requested}". Available: ${available || "none"}`);
    }

    return {
      ...system,
      paths: {
        input: path.resolve(this.repoRoot, String(system.inputDir || "")),
        output: path.resolve(this.repoRoot, String(system.outputDir || "")),
        generated: path.resolve(this.repoRoot, String(system.docsDir || ""), "_generated"),
        specs: path.resolve(this.repoRoot, String(system.docsDir || ""), "_spec/components"),
        docs: path.resolve(this.repoRoot, String(system.docsDir || ""), "components"),
        registry: path.resolve(
          this.repoRoot,
          String(system.docsDir || ""),
          "_generated",
          "component-registry.json",
        ),
        tokenRegistry: path.resolve(
          this.repoRoot,
          String(system.docsDir || ""),
          "_generated",
          "token-registry.json",
        ),
      },
    };
  }

  resolveDashboardSystemContext(systemHeader: string | undefined): DashboardSystemContext {
    const config = this.getConfig();
    const requested = String(systemHeader || "").trim();
    const system = this.resolveSystemEntry(config, requested);
    if (!system) {
      const fallbackRequested = requested || String(config.defaultSystem || "").trim();
      const available = Array.isArray(config.systems)
        ? config.systems.map((row) => String(row?.id || "").trim()).filter(Boolean).join(", ")
        : "";
      if (!fallbackRequested) {
        throw new Error("No design systems configured.");
      }
      throw new Error(`Unknown design system: "${fallbackRequested}". Available: ${available || "none"}`);
    }
    const systemId = String(system.id || "").trim() || FALLBACK_SYSTEM_ID;

    const docsDir = path.resolve(this.repoRoot, String(system.docsDir || ""));
    const genDir = path.join(docsDir, "_generated");

    return {
      systemId,
      repoRoot: this.repoRoot,
      docsDir,
      genDir,
      componentRegistryPath: path.join(genDir, "component-registry.json"),
      tokenRegistryPath: path.join(genDir, "token-registry.json"),
      tokenGraphVizPath: path.join(genDir, "token-graph.viz.json"),
      tokenUsageIndexPath: path.join(genDir, "token-usage-index.json"),
      tokenHealthPath: path.join(genDir, "token-health.json"),
      componentsHealthPath: path.join(genDir, "components-health.json"),
      healthHistoryPath: path.join(genDir, "health-history.json"),
      namingDebtCachePath: path.join(genDir, "naming-debt.json"),
      namingDebtConfigPath: path.join(this.repoRoot, "tooling", "config", "naming-debt.config.json"),
      specBackupsDirPath: path.join(genDir, "spec-backups"),
      wcagPairsPath: path.join(this.repoRoot, "tooling", "config", "wcag-pairs.json"),
      tokenDiffScriptPath: path.join(this.repoRoot, "tooling", "scripts", "ds-token-diff.mjs"),
      healthSnapshotScriptPath: path.join(this.repoRoot, "tooling", "scripts", "ds-health-snapshot.mjs"),
      captureFromFigmaUrlScriptPath: path.join(
        this.repoRoot,
        "tooling",
        "scripts",
        "ds-capture-from-figma-url.mjs",
      ),
      tokensFromFigmaScriptPath: path.join(
        this.repoRoot,
        "tooling",
        "scripts",
        "ds-tokens-from-figma.mjs",
      ),
      rawConfig: config,
    };
  }
}

export function createDesignSystemRepository(options: DesignSystemRepositoryOptions) {
  return new DesignSystemRepository(options);
}
