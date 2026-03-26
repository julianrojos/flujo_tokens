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

export const DEFAULT_THEME_PATH = path.resolve(PROJECT_ROOT, "tooling/figma-doc-theme.yml");

/**
 * Safe variant for module-level (top-of-file) usage.
 * Returns the default system context and throws on invalid/missing config.
 * @param {Object} opts - Optional override options
 * @param {string} [opts.system] - System ID
 */
export function resolveSystemContextSafe(opts = {}) {
  return resolveSystemContext(opts);
}
