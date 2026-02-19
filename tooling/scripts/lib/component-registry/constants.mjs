import path from "node:path";

import {
  COMPONENT_DOCS_DIR,
  DOCS_SPEC_DIR,
  FIGMA_DOC_MODELS_DIR,
  resolveProjectPath,
} from "../paths.mjs";

export const COMPONENT_REGISTRY_SCHEMA_VERSION = 1;

export const DEFAULT_COMPONENT_SPECS_DIR = path.join(DOCS_SPEC_DIR, "components");
export const DEFAULT_COMPONENT_DOCS_DIR = COMPONENT_DOCS_DIR;
export const DEFAULT_VISUAL_PROOFS_DIR = resolveProjectPath(
  "docs",
  "_generated",
  "visual-proofs",
);
export const DEFAULT_RENDER_PAYLOADS_DIR = FIGMA_DOC_MODELS_DIR;
export const DEFAULT_COMPONENT_REGISTRY_PATH = resolveProjectPath(
  "docs",
  "_generated",
  "component-registry.json",
);
export const DEFAULT_COMPONENT_OVERVIEW_PATH = path.join(
  COMPONENT_DOCS_DIR,
  "overview.md",
);

export const PIPELINE_STAGE_ORDER = [
  "missing-spec",
  "spec",
  "markdown",
  "render",
  "visual-proof",
];
