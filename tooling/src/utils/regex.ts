/**
 * Regular expressions used throughout the pipeline.
 */

/**
 * W3C reference payloads: `{some.path}`.
 *
 * Note on global regexes (`/g`): they are stateful in JS via `lastIndex`.
 * This script keeps distinct instances for replacement vs collection, and resets `lastIndex`
 * around each use to avoid state leakage across calls.
 */
const W3C_REF_PATTERN_SOURCE = '\\{([A-Za-z0-9_./\\s-]+)\\}';
export const W3C_REF_REGEX_REPLACE = new RegExp(W3C_REF_PATTERN_SOURCE, 'g'); // Replacement/scanning.
export const W3C_REF_REGEX_COLLECT = new RegExp(W3C_REF_PATTERN_SOURCE, 'g'); // Dependency collection via exec() loops.

/**
 * Stateless reference test regex.
 * Prefer this for boolean checks (e.g. "does the string contain any reference?").
 */
export const W3C_REF_REGEX_TEST = new RegExp(W3C_REF_PATTERN_SOURCE);

/** Helpers for validating CSS custom property names. */
export const STARTS_WITH_DIGIT_REGEX = /^\d/;
export const CSS_VAR_NAME_AFTER_DASHES_REGEX = /^[a-zA-Z0-9_-]+$/;

/**
 * Matches a single CSS variable declaration line produced by this script:
 *   `  --name: <value>;` with an optional trailing block comment.
 *
 * Used only for change detection against this script's own output format.
 */
export const CSS_DECL_LINE_REGEX = /^\s*--([a-zA-Z0-9_-]+):\s*(.*);\s*(?:\/\*[\s\S]*\*\/\s*)?$/;
