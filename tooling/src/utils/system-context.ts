import path from "node:path";
import { fileURLToPath } from "node:url";
import * as fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, "../../..");

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
  compileVariablesOnCapture?: boolean;
}

/**
 * Design systems configuration file structure.
 */
export interface DesignSystemsFile {
  systems: DesignSystemConfig[];
  defaultSystem?: string;
}

/**
 * Legacy fallback paths for module-level defaults when design-systems.json
 * is missing or broken.
 */
const LEGACY_PATHS = Object.freeze({
  generated: path.resolve(PROJECT_ROOT, "docs/_generated"),
  specs: path.resolve(PROJECT_ROOT, "docs/_spec/components"),
  docs: path.resolve(PROJECT_ROOT, "docs/components"),
  registry: path.resolve(PROJECT_ROOT, "docs/_generated/component-registry.json"),
  tokenRegistry: path.resolve(PROJECT_ROOT, "docs/_generated/token-registry.json"),
  figmaAliasGraph: path.resolve(PROJECT_ROOT, "docs/_generated/figma-alias-graph.json"),
});

export const DEFAULT_THEME_PATH = path.resolve(PROJECT_ROOT, "tooling/figma-doc-theme.yml");

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
    registry: string;
    tokenRegistry: string;
    figmaAliasGraph: string;
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
      registry: path.resolve(docsDir, "_generated/component-registry.json"),
      tokenRegistry: path.resolve(docsDir, "_generated/token-registry.json"),
      figmaAliasGraph: path.resolve(docsDir, "_generated/figma-alias-graph.json"),
    },
  };
}

/**
 * Load design systems configuration from the central config file.
 */
export function loadDesignSystemsConfig(): DesignSystemsFile {
  const configPath = path.join(PROJECT_ROOT, "tooling/config/design-systems.json");
  try {
    const configRaw = fs.readFileSync(configPath, "utf8");
    return JSON.parse(configRaw) as DesignSystemsFile;
  } catch (err) {
    throw new Error(
      `Cannot load design-systems.json at ${configPath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Resolve system context from the central repository.
 * Returns the active system context based on defaultSystem or explicit system ID.
 * Falls back to legacy paths if design-systems.json is unreadable.
 */
export function resolveSystemContextSafe(opts?: { system?: string }): ScriptSystemContext {
  try {
    const config = loadDesignSystemsConfig();
    const systemId = opts?.system || config.defaultSystem;

    // Try to find requested system or default
    if (config.systems && systemId) {
      const system = config.systems.find(s => s.id === systemId);
      if (system) {
        return systemContext(system);
      }
    }

    // Fallback to first system or ultimate legacy
    const firstSystem = config.systems?.[0];
    return firstSystem
      ? systemContext(firstSystem)
      : legacyContext("_legacy");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[system-context] Falling back to legacy paths: ${msg}`);
    return legacyContext("_legacy");
  }
}

/**
 * Create a legacy context object with the given id.
 */
function legacyContext(id: string): ScriptSystemContext {
  return {
    id,
    name: "Legacy",
    docsDir: LEGACY_PATHS.docs,
    paths: {
      input: LEGACY_PATHS.generated,
      output: LEGACY_PATHS.generated,
      ...LEGACY_PATHS,
    },
  };
}

/**
 * Get the default system context for module-level usage.
 */
export function getDefaultSystemContext(): ScriptSystemContext {
  return resolveSystemContextSafe();
}

/**
 * Export legacy paths for backward compatibility.
 */
export { LEGACY_PATHS };
