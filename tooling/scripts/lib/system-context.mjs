import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, "../../..");

let cachedConfig = null;

function loadDesignSystems() {
  if (cachedConfig) return cachedConfig;
  const configPath = path.join(PROJECT_ROOT, "tooling/config/design-systems.json");
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    cachedConfig = JSON.parse(raw);
    return cachedConfig;
  } catch (err) {
    throw new Error(
      `Cannot load design-systems.json at ${configPath}: ${err.message}`
    );
  }
}

export function resolveSystemContext(opts) {
  const config = loadDesignSystems();
  const id = opts?.system ?? config.defaultSystem;
  const system = config.systems.find((s) => s.id === id);
  
  if (!system) {
    const available = config.systems.map((s) => s.id).join(", ");
    throw new Error(`Unknown system: "${id}". Available: ${available}`);
  }

  return {
    ...system,
    paths: {
      input: path.resolve(PROJECT_ROOT, system.inputDir),
      output: path.resolve(PROJECT_ROOT, system.outputDir),
      generated: path.resolve(PROJECT_ROOT, system.docsDir, "_generated"),
      specs: path.resolve(PROJECT_ROOT, system.docsDir, "_spec/components"),
      docs: path.resolve(PROJECT_ROOT, system.docsDir, "components"),
      registry: path.resolve(PROJECT_ROOT, system.docsDir, "_generated", "component-registry.json"),
      tokenRegistry: path.resolve(PROJECT_ROOT, system.docsDir, "_generated", "token-registry.json"),
    },
  };
}

// ─── Legacy fallback ─────────────────────────────────────────────────────────
// Provides the same paths that paths.mjs used to export, so module-level
// defaults survive even when design-systems.json is missing or broken.

const LEGACY_PATHS = Object.freeze({
  generated: path.resolve(PROJECT_ROOT, "docs/_generated"),
  specs:     path.resolve(PROJECT_ROOT, "docs/_spec/components"),
  docs:      path.resolve(PROJECT_ROOT, "docs/components"),
  registry:  path.resolve(PROJECT_ROOT, "docs/_generated/component-registry.json"),
  tokenRegistry: path.resolve(PROJECT_ROOT, "docs/_generated/token-registry.json"),
});

export const DEFAULT_THEME_PATH = path.resolve(PROJECT_ROOT, "tooling/figma-doc-theme.yml");

/**
 * Safe variant for module-level (top-of-file) usage.
 * Returns the default system context, falling back to legacy paths if
 * design-systems.json is unreadable.
 * @param {Object} opts - Optional override options
 * @param {string} [opts.system] - System ID
 */
export function resolveSystemContextSafe(opts = {}) {
  try {
    return resolveSystemContext(opts);
  } catch {
    return { id: "_legacy", docsDir: "docs", paths: LEGACY_PATHS };
  }
}

export function resolveProjectPath(...parts) {
  return path.resolve(PROJECT_ROOT, ...parts);
}

