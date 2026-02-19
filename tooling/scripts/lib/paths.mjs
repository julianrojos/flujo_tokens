import path from "node:path";
import { fileURLToPath } from "node:url";

// Derive project root from this file's location (tooling/scripts/lib/paths.mjs → ../../..)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, "..", "..", "..");

export function resolveProjectPath(...parts) {
  const resolved = path.resolve(PROJECT_ROOT, ...parts);
  const rootWithSep = PROJECT_ROOT.endsWith(path.sep)
    ? PROJECT_ROOT
    : `${PROJECT_ROOT}${path.sep}`;
  if (resolved !== PROJECT_ROOT && !resolved.startsWith(rootWithSep)) {
    throw new Error(
      `Resolved path escapes project root: ${resolved} (root: ${PROJECT_ROOT})`,
    );
  }
  return resolved;
}

export const DOCS_ROOT = resolveProjectPath("docs");
export const COMPONENT_DOCS_DIR = path.join(DOCS_ROOT, "components");
export const DOCS_SPEC_DIR = path.join(DOCS_ROOT, "_spec");
const DOCS_GENERATED_DIR = path.join(DOCS_ROOT, "_generated");
export const SYNC_STATE_PATH = path.join(DOCS_GENERATED_DIR, ".sync-state.json");
export const FIGMA_DOC_THEME_PATH = path.join(DOCS_SPEC_DIR, "figma_doc_theme.yml");
export const FIGMA_DOC_MODELS_DIR = path.join(DOCS_GENERATED_DIR, "figma_doc_models");
