import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDesignSystemRepository } from "./system-repository.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, "../../..");

const systemRepository = createDesignSystemRepository({ repoRoot: PROJECT_ROOT });

function loadDesignSystems() {
  try {
    return systemRepository.getConfig();
  } catch (err) {
    const configPath = path.join(PROJECT_ROOT, "tooling/config/design-systems.json");
    throw new Error(
      `Cannot load design-systems.json at ${configPath}: ${err.message}`
    );
  }
}

export function resolveSystemContext(opts) {
  loadDesignSystems();
  return systemRepository.resolveSystemContext(opts?.system);
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
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[system-context] Falling back to legacy paths: ${msg}`);
    return { id: "_legacy", docsDir: "docs", paths: {} };
  }
}
