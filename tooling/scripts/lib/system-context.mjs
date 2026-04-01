import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDesignSystemRepository } from "./system-repository.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, "../../..");

const systemRepository = createDesignSystemRepository({ repoRoot: PROJECT_ROOT });
let disposed = false;

function disposeSystemRepository() {
  if (disposed) return;
  disposed = true;
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

export function resolveSystemContext(opts) {
  try {
    return systemRepository.resolveSystemContext(opts?.system);
  } catch (err) {
    throw new Error(`Cannot resolve design system context from SQLite: ${err.message}`);
  }
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
