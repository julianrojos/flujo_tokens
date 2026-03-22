/**
 * Gaps validation contract. Centralizes all rules, constraints, and error codes for
 * the ## Gaps / TBD section validation in component documentation pages.
 *
 * Source of truth for:
 * - Error codes: GAP00, GAP01, GAP02
 * - Validation rules: section presence, checkbox format, content matching
 * - Gap type ordering: SCHEMA_TBD, TOKEN_INVALID, CONTENT_UNKNOWN, A11Y_TBD
 *
 * Used by: docs-validator.mjs (validate gaps section contract)
 */

export const GAP_TYPE = Object.freeze({
  SCHEMA_TBD: "SCHEMA_TBD",
  TOKEN_INVALID: "TOKEN_INVALID",
  CONTENT_UNKNOWN: "CONTENT_UNKNOWN",
  A11Y_TBD: "A11Y_TBD",
});

/**
 * Canonical ordering of gap types in checklist.
 * Used to sort gaps deterministically when generating expected checklist.
 */
export const GAP_TYPE_ORDER = new Map([
  [GAP_TYPE.SCHEMA_TBD, 1],
  [GAP_TYPE.TOKEN_INVALID, 2],
  [GAP_TYPE.CONTENT_UNKNOWN, 3],
  [GAP_TYPE.A11Y_TBD, 4],
]);

/**
 * Error codes for gaps section validation.
 * See component-doc.mdc § "Gaps / TBD" for human-readable definitions.
 */
export const GAP_ERROR_CODES = Object.freeze({
  GAP00: "GAP00",
  // Spec file missing but gaps section declared in markdown.
  // → Warning only, not blocking. Spec existence check happens elsewhere.

  GAP01: "GAP01",
  // Gaps section validation failed (any of):
  // - Spec could not be parsed
  // - Gaps section is required but missing
  // - Gaps section is declared but not needed (no gaps in spec)
  // - Gaps section body is empty (no checklist items)
  // - Checklist item format is invalid (not "- [ ] [TYPE] ...")
  // - Gaps section content does not match canonical expected content

  GAP02: "GAP02",
  // Spec status is 'ready' but gaps still exist.
  // Blocker: cannot mark spec as 'ready' while there are unresolved gaps.
  // Error is reported on the spec file, not the markdown.
});

/**
 * Validation rules for gaps section format.
 */
export const GAPS_VALIDATION = Object.freeze({
  // Pattern for a valid gap checklist item.
  // Must be: "- [ ] [GAP_TYPE] description"
  // Where GAP_TYPE is one of SCHEMA_TBD, TOKEN_INVALID, CONTENT_UNKNOWN, A11Y_TBD
  checkboxFormatRegex: /^-\s+\[\s\]\s+\[[A-Z0-9_]+\]\s+.+$/,

  // When spec has gaps, markdown MUST have a "## Gaps / TBD" section.
  // When spec has no gaps, markdown MUST NOT have a "## Gaps / TBD" section.
  sectionMustBePresent: true,
  sectionMustBeDeterministic: true,

  // Spec status: ready REQUIRES no gaps. If gaps exist, spec is invalid.
  readyStatusRequiresNoGaps: true,
});

/**
 * Check descriptions for error codes (used in validation messages).
 */
export const GAP_CHECK_MESSAGES = Object.freeze({
  GAP00: "Gaps section exists but linked spec file is missing; deterministic gap checks were skipped.",

  GAP01_spec_parse_error:
    "Unable to validate Gaps / TBD contract because spec could not be parsed.",

  GAP01_section_not_needed:
    "`## Gaps / TBD` must be omitted when the linked spec has no unresolved gaps.",

  GAP01_section_missing:
    "Missing required `## Gaps / TBD` section. The linked spec has unresolved gaps.",

  GAP01_section_empty:
    "`## Gaps / TBD` must contain checklist items in canonical checkbox format.",

  GAP01_invalid_item_format:
    "Every Gaps item must use checkbox format: `- [ ] [GAP_TYPE] ...`.",

  GAP01_content_mismatch:
    "Gaps section does not match canonical deterministic content generated from spec + token registry.",

  GAP02_ready_with_gaps:
    "Spec status is `ready` but unresolved gaps still exist. Resolve gaps or set status back to `draft`.",

  GAP02_note: " Linked spec is also invalid: status `ready` with unresolved gaps (GAP02).",
});

/**
 * Helper to determine if a string is a gap marker (TBD, unknown, unverified, etc).
 * Used by gaps.mjs when walking spec tree.
 */
export function isGapMarker(raw) {
  return /^(?:tbd|unknown|unverified|not[-_\s]?defined)$/i.test(String(raw || "").trim());
}

/**
 * Classify a spec path into a gap type.
 * Used by gaps.mjs::classifyUnknownPath to assign types when extracting gaps.
 */
export function classifyGapType(pathKey) {
  const key = String(pathKey || "").toLowerCase();
  if (key.startsWith("accessibility.")) return GAP_TYPE.A11Y_TBD;
  if (
    key.startsWith("anatomy.") ||
    key.startsWith("properties.") ||
    key.startsWith("summary.") ||
    key.startsWith("content_guidelines.") ||
    key.startsWith("best_practices.") ||
    key.startsWith("related_components.")
  ) {
    return GAP_TYPE.CONTENT_UNKNOWN;
  }
  return GAP_TYPE.SCHEMA_TBD;
}
