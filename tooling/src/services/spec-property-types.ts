/**
 * Runtime mirror of tooling/config/property-type-map.json.
 *
 * This module derives type metadata from the JSON file. The JSON is the
 * single source of truth that agents, scripts, and validators all share.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use relative path to utils
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

// Load type map from JSON
const typeMapPath = path.join(PROJECT_ROOT, 'tooling/config/property-type-map.json');
let TYPE_MAP: any = {};

try {
  const content = fs.readFileSync(typeMapPath, 'utf8');
  TYPE_MAP = JSON.parse(content);
} catch {
  // Fallback if file doesn't exist
  TYPE_MAP = {
    type_metadata: {
      variant: { figma_display: 'VARIANT', ordering_group: 1, requires_values: true },
      text: { figma_display: 'TEXT', ordering_group: 2, requires_values: false },
      boolean: { figma_display: 'BOOLEAN', ordering_group: 3, requires_values: false },
      instance_swap: { figma_display: 'INSTANCE_SWAP', ordering_group: 4, requires_values: false },
    },
    normalization: {
      aliases: {
        'variant': 'enum',
      },
    },
  };
}

// Build canonical types structure
const CANONICAL_TYPES = Object.freeze(
  Object.fromEntries(
    Object.entries(TYPE_MAP.type_metadata).map(([specType, meta]: [string, any]) => [
      specType,
      Object.freeze({
        canonicalType: specType,
        figmaDisplayType: meta.figma_display,
        orderingGroup: meta.ordering_group,
        requiresValues: meta.requires_values,
      }),
    ]),
  ),
);

export const SPEC_PROPERTY_ALLOWED_TYPES = new Set(Object.keys(CANONICAL_TYPES));

/**
 * Normalize a raw property type string to canonical form.
 */
export function normalizeSpecPropertyType(rawType: string | null | undefined): string {
  return String(rawType ?? '')
    .replace(/#.*$/, '')
    .trim()
    .toLowerCase();
}

/**
 * Get type metadata for a normalized type string.
 */
export function getSpecPropertyTypeInfo(rawType: string | null | undefined) {
  const normalized = normalizeSpecPropertyType(rawType);
  return (CANONICAL_TYPES as any)[normalized] || null;
}

/**
 * Canonical field order within each property object in a spec YAML.
 * Sourced from component-spec-properties-order.mdc § "Canonical field order".
 * Used by ds:sort-spec and validate:docs (DET01).
 */
export const PROPERTY_FIELD_ORDER = Object.freeze([
  'name', 'type', 'values', 'default', 'required', 'description',
]);

/**
 * Returns true if all property objects have fields in canonical order.
 * Only checks fields that are present in the object (subset check).
 */
export function hasCanonicalPropertyFieldOrder(properties: unknown): boolean {
  if (!Array.isArray(properties)) return true;
  for (const prop of properties) {
    if (!prop || typeof prop !== 'object' || Array.isArray(prop)) continue;
    const propAny = prop as Record<string, unknown>;
    const keys = Object.keys(propAny).filter((k) => PROPERTY_FIELD_ORDER.includes(k));
    const expected = PROPERTY_FIELD_ORDER.filter((k) => k in propAny);
    if (keys.join(',') !== expected.join(',')) return false;
  }
  return true;
}

/**
 * Coerce a raw type string to a canonical type, applying aliases.
 */
export function coerceSpecPropertyType(rawType: string | null | undefined): string {
  const normalized = normalizeSpecPropertyType(rawType);
  if (!normalized) return '';
  // Figma often uses "variant" for the axis type; specs normalize this to "enum".
  const alias = (TYPE_MAP.normalization?.aliases as any)?.[normalized];
  if (alias) return alias;
  if ((CANONICAL_TYPES as any)[normalized]) return normalized;
  return '';
}
