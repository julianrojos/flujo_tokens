/**
 * Markdown Validation Constants
 *
 * Shared constants and regex patterns for markdown validation.
 * Used by both docs-validator.ts and markdown-quality.ts.
 */

/**
 * Regex source for Figma variable ID detection.
 */
export const VARIABLE_ID_RE_SOURCE = '\\bVariableID:[A-Za-z0-9:-]+\\b';

/**
 * Regex for matching markdown links (not images).
 */
export const MARKDOWN_LINK_RE = /(?<!!)\[[^\]]*\]\(([^)\n]+)\)/g;

/**
 * Editorial placeholder patterns to detect in markdown.
 */
export const PLACEHOLDER_PATTERNS = [
  { regex: /\bTODO\b/gi, label: 'TODO' },
  { regex: /\bXXX\b/gi, label: 'XXX' },
  { regex: /\{placeholder\}/gi, label: '{placeholder}' },
  { regex: /<placeholder>/gi, label: '<placeholder>' },
] as const;

/**
 * Cache for heading anchors per file (prevents re-parsing).
 */
export const HEADING_ANCHOR_CACHE = new Map<string, Set<string>>();
