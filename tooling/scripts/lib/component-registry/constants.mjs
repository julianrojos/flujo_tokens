import path from "node:path";

import { resolveSystemContextSafe, PROJECT_ROOT } from "../system-context.mjs";

const _defaultCtx = resolveSystemContextSafe();

export const COMPONENT_REGISTRY_SCHEMA_VERSION = 1;

export const DEFAULT_COMPONENT_SPECS_DIR = _defaultCtx.paths.specs;
export const DEFAULT_COMPONENT_DOCS_DIR = _defaultCtx.paths.docs;
export const DEFAULT_VISUAL_PROOFS_DIR = path.join(_defaultCtx.paths.generated, "visual-proofs");
export const DEFAULT_RENDER_PAYLOADS_DIR = path.join(_defaultCtx.paths.generated, "figma_doc_models");
export const DEFAULT_COMPONENT_REGISTRY_PATH = _defaultCtx.paths.registry;
export const DEFAULT_COMPONENT_OVERVIEW_PATH = path.join(
  _defaultCtx.paths.docs,
  "overview.md",
);

export const PIPELINE_STAGE_ORDER = [
  "missing-spec",
  "spec",
  "markdown",
  "render",
  "visual-proof",
];
