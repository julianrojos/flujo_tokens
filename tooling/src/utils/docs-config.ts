/**
 * Docs Config Utilities
 *
 * Runtime mirror of tooling/lib/markdown-sections.json.
 *
 * CANONICAL_H2_ORDER and its derived slices are derived from the JSON file,
 * which is the single source of truth. To change the section list or order,
 * edit the JSON file and this module will reflect it automatically.
 *
 * Migrated from tooling/scripts/lib/docs-config.mjs
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const SECTIONS = require('../../lib/markdown-sections.json');

/**
 * Canonical order of H2 sections in component documentation.
 */
export const CANONICAL_H2_ORDER: string[] = SECTIONS.canonical_h2_order;

/**
 * Required H2 sections (must appear in order at the beginning).
 */
export const REQUIRED_CANONICAL_H2: string[] = CANONICAL_H2_ORDER.slice(
  0,
  SECTIONS.required_count
);

/**
 * Optional H2 sections (may appear after required sections, still in canonical order).
 */
export const OPTIONAL_CANONICAL_H2: string[] = CANONICAL_H2_ORDER.slice(
  SECTIONS.required_count
);

/**
 * Allowed token collection prefixes for validation.
 */
export const TOKEN_COLLECTION_PREFIXES = new Set([
  'Semantic',
  'Primitives',
  'Components',
  'A11y',
]);

/**
 * Allowed spec status values.
 */
export const SPEC_ALLOWED_STATUS = new Set(['draft', 'ready']);

/**
 * Required top-level fields for component specs.
 */
export const SPEC_REQUIRED_TOP_LEVEL_FIELDS: string[] = [
  'name',
  'status',
  'figma',
  'summary',
  'anatomy',
  'properties',
  'content_guidelines',
  'accessibility',
  'token_mapping',
  'qa',
];
