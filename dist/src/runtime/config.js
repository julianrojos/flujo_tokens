/**
 * Shared configuration constants.
 */
/** Maximum recursion depth for tree traversal and reference resolution. */
export const MAX_DEPTH = 50;
/** Allow best-effort JSON repair for malformed exports. */
export const ALLOW_JSON_REPAIR = process.env.ALLOW_JSON_REPAIR === 'true';
/** Maximum collision details to store in summary. */
export const MAX_COLLISION_DETAILS = 10;
/** Maximum details to show in summary output. */
export const MAX_SUMMARY_DETAILS = 10;
/** Shared empty set used as a safe default for cycle detection seeds. */
export const EMPTY_VISITED_REFS = new Set();
