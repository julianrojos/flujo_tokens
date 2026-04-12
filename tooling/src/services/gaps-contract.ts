/**
 * Gaps Validation Contract
 *
 * Centralizes all rules, constraints, and error codes for
 * the ## Gaps / TBD section validation in component documentation pages.
 *
 * Source of truth for:
 * - Error codes: GAP00, GAP01, GAP02
 * - Validation rules: section presence, checkbox format, content matching
 * - Gap type ordering: SCHEMA_TBD, TOKEN_INVALID, CONTENT_UNKNOWN, A11Y_TBD
 */

/**
 * Gap type constants.
 */
export const GAP_TYPE = Object.freeze({
  SCHEMA_TBD: 'SCHEMA_TBD',
  TOKEN_INVALID: 'TOKEN_INVALID',
  CONTENT_UNKNOWN: 'CONTENT_UNKNOWN',
  A11Y_TBD: 'A11Y_TBD',
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
 */
export const GAP_ERROR_CODES = Object.freeze({
  GAP00: 'GAP00',
  GAP01: 'GAP01',
  GAP02: 'GAP02',
});

/**
 * Validation rules for gaps section format.
 */
export const GAPS_VALIDATION = Object.freeze({
  checkboxFormatRegex: /^-\s+\[\s\]\s+\[[A-Z0-9_]+\]\s+.+$/,
  sectionMustBePresent: true,
  sectionMustBeDeterministic: true,
  readyStatusRequiresNoGaps: true,
});

/**
 * Check descriptions for error codes.
 */
export const GAP_CHECK_MESSAGES = Object.freeze({
  GAP00: 'Gaps section exists but linked spec file is missing; deterministic gap checks were skipped.',

  GAP01_spec_parse_error:
    'Unable to validate Gaps / TBD contract because spec could not be parsed.',

  GAP01_section_not_needed:
    '`## Gaps / TBD` must be omitted when the linked spec has no unresolved gaps.',

  GAP01_section_missing:
    'Missing required `## Gaps / TBD` section. The linked spec has unresolved gaps.',

  GAP01_section_empty:
    '`## Gaps / TBD` must contain checklist items in canonical checkbox format.',

  GAP01_invalid_item_format:
    'Every Gaps item must use checkbox format: `- [ ] [GAP_TYPE] ...`.',

  GAP01_content_mismatch:
    'Gaps section does not match canonical deterministic content generated from spec + token registry.',

  GAP02_ready_with_gaps:
    'Spec status is `ready` but unresolved gaps still exist. Resolve gaps or set status back to `draft`.',

  GAP02_note: ' Linked spec is also invalid: status `ready` with unresolved gaps (GAP02).',
});

/**
 * Check if a string is a gap marker (TBD, unknown, unverified, etc).
 */
export function isGapMarker(raw: unknown): boolean {
  return /^(?:tbd|unknown|unverified|not[-_\s]?defined)$/i.test(String(raw || '').trim());
}

/**
 * Classify a spec path into a gap type.
 */
export function classifyGapType(pathKey: string): string {
  const key = String(pathKey || '').toLowerCase();
  if (key.startsWith('accessibility.')) return GAP_TYPE.A11Y_TBD;
  if (
    key.startsWith('anatomy.') ||
    key.startsWith('properties.') ||
    key.startsWith('summary.') ||
    key.startsWith('content_guidelines.')
  ) {
    return GAP_TYPE.CONTENT_UNKNOWN;
  }
  return GAP_TYPE.SCHEMA_TBD;
}

/**
 * A gap item extracted from a spec.
 */
export interface GapItem {
  type: string;
  path: string;
  value: string;
  message: string;
  suggested: string;
}
