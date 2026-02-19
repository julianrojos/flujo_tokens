import path from "node:path";
import { fileURLToPath } from "node:url";

// Derive project root from this file's location (tooling/scripts/lib/paths.mjs → ../../..)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, "..", "..", "..");

export const DOCS_ROOT = path.join(PROJECT_ROOT, "docs");
export const COMPONENT_DOCS_DIR = path.join(DOCS_ROOT, "components");
export const DOCS_SPEC_DIR = path.join(DOCS_ROOT, "_spec");
export const DOCS_GENERATED_DIR = path.join(DOCS_ROOT, "_generated");
export const SYNC_STATE_PATH = path.join(DOCS_GENERATED_DIR, ".sync-state.json");
export const FIGMA_DOC_THEME_PATH = path.join(DOCS_SPEC_DIR, "figma_doc_theme.yml");
export const FIGMA_DOC_MODELS_DIR = path.join(DOCS_GENERATED_DIR, "figma_doc_models");
