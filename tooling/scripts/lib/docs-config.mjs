/**
 * Runtime mirror of tooling/lib/markdown-sections.json.
 *
 * CANONICAL_H2_ORDER and its derived slices are derived from the JSON file,
 * which is the single source of truth. To change the section list or order,
 * edit the JSON and this module will reflect it automatically.
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const SECTIONS = require("../../lib/markdown-sections.json");

export const CANONICAL_H2_ORDER = SECTIONS.canonical_h2_order;
export const REQUIRED_CANONICAL_H2 = CANONICAL_H2_ORDER.slice(0, SECTIONS.required_count);
export const OPTIONAL_CANONICAL_H2 = CANONICAL_H2_ORDER.slice(SECTIONS.required_count);

export const TRACEABILITY_CONTRACT_VERSION = "1";
export const TOKEN_COLLECTION_PREFIXES = new Set([
  "Semantic",
  "Primitives",
  "Components",
  "A11y",
]);

export const ALLOWED_DOC_STATUS = new Set(["draft", "ready", "needs-review"]);
export const SPEC_ALLOWED_STATUS = new Set(["draft", "ready"]);

export const COMPONENT_REQUIRED_FIGMA_FRONTMATTER_FIELDS = [
  "file_url",
  "page",
  "component",
  "last_verified",
];

export const SPEC_REQUIRED_TOP_LEVEL_FIELDS = [
  "name",
  "status",
  "figma",
  "summary",
  "anatomy",
  "properties",
  "content_guidelines",
  "best_practices",
  "accessibility",
  "token_mapping",
  "qa",
];
