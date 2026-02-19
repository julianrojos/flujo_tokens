export const CANONICAL_H2_ORDER = [
  "Overview",
  "Anatomy",
  "Component API",
  "Visual Specifications",
  "Variants",
  "States",
  "Usage Guidelines",
  "Content Guidelines",
  "Accessibility",
  "Related Components",
  "Design–Token Discrepancies",
  "Gaps / TBD",
];

export const REQUIRED_CANONICAL_H2 = CANONICAL_H2_ORDER.slice(0, 10);
export const OPTIONAL_CANONICAL_H2 = CANONICAL_H2_ORDER.slice(10);
export const TRACEABILITY_CONTRACT_VERSION = "1";

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
