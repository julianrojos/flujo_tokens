/**
 * Documentation Configuration
 *
 * Runtime mirror of tooling/lib/markdown-sections.json.
 *
 * CANONICAL_H2_ORDER and its derived slices are derived from the JSON file,
 * which is the single source of truth. To change the section list or order,
 * edit the JSON and this module will reflect it automatically.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const SECTIONS = require('../../lib/markdown-sections.json');

/**
 * Canonical H2 heading order for component documentation.
 * Sourced from tooling/lib/markdown-sections.json
 */
export const CANONICAL_H2_ORDER: string[] = SECTIONS.canonical_h2_order;

/**
 * Required H2 headings (first N sections based on required_count).
 */
export const REQUIRED_CANONICAL_H2: string[] = CANONICAL_H2_ORDER.slice(0, SECTIONS.required_count);

/**
 * Optional H2 headings (remaining sections after required_count).
 */
export const OPTIONAL_CANONICAL_H2: string[] = CANONICAL_H2_ORDER.slice(SECTIONS.required_count);

/**
 * Valid token collection prefixes for token path validation.
 */
export const TOKEN_COLLECTION_PREFIXES = new Set([
  'Semantic',
  'Primitives',
  'Components',
  'A11y',
]);

/**
 * Allowed values for spec status field.
 */
export const SPEC_ALLOWED_STATUS = new Set(['draft', 'ready']);

/**
 * Required top-level fields for spec YAML files.
 */
export const SPEC_REQUIRED_TOP_LEVEL_FIELDS = [
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
