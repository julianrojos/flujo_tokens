import path from "node:path";
import { fileURLToPath } from "node:url";
import * as fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, "../../..");

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
});

export const DEFAULT_THEME_PATH = path.resolve(PROJECT_ROOT, "tooling/figma-doc-theme.yml");

export interface ScriptSystemContext {
  id: string;
  docsDir: string;
  paths: {
    input: string;
    output: string;
    generated: string;
    specs: string;
    docs: string;
    registry: string;
    tokenRegistry: string;
  };
}

/**
 * Create a legacy context object with the given id and docsDir.
 */
function legacyContext(id: string, docsDir = "docs"): ScriptSystemContext {
  return {
    id,
    docsDir,
    paths: {
      input: LEGACY_PATHS.generated,
      output: LEGACY_PATHS.generated,
      ...LEGACY_PATHS,
    },
  };
}

/**
 * Load design systems configuration from the central config file.
 */
export function loadDesignSystemsConfig(): unknown {
  const configPath = path.join(PROJECT_ROOT, "tooling/config/design-systems.json");
  try {
    const configRaw = fs.readFileSync(configPath, "utf8");
    return JSON.parse(configRaw);
  } catch (err) {
    throw new Error(
      `Cannot load design-systems.json at ${configPath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Resolve system context from the central repository.
 * Falls back to legacy paths if design-systems.json is unreadable.
 *
 * Note: This is a simplified version. For full repository functionality,
 * use the repository module from ds-dashboard server.
 */
export function resolveSystemContextSafe(opts?: { system?: string }): ScriptSystemContext {
  try {
    const config = loadDesignSystemsConfig() as { systems?: Array<{ id: string; docsDir?: string }>; defaultSystem?: string };
    const systemId = opts?.system || config.defaultSystem;

    // Try to find requested system or default
    if (config.systems && systemId) {
      const system = config.systems.find(s => s.id === systemId);
      if (system) {
        return legacyContext(system.id, system.docsDir);
      }
    }

    // Fallback to first system or ultimate legacy
    const firstSystem = config.systems?.[0];
    return firstSystem
      ? legacyContext(firstSystem.id, firstSystem.docsDir)
      : legacyContext("_legacy");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[system-context] Falling back to legacy paths: ${msg}`);
    return legacyContext("_legacy");
  }
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
