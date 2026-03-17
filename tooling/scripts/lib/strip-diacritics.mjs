/**
 * Shared diacritics normalization for legacy .mjs tooling scripts.
 * Keep behavior aligned with tooling/src/utils/strip-diacritics.ts.
 */

const COMBINING_MARKS_REGEX = /[\u0300-\u036f\u1ab0-\u1aff\u20d0-\u20ff]/g;

export function stripDiacritics(input) {
  if (!input || typeof input !== "string") {
    return "";
  }
  return input.normalize("NFKD").replace(COMBINING_MARKS_REGEX, "");
}

