/**
 * Spec Property Types
 *
 * Runtime mirror of tooling/lib/property-type-map.json.
 *
 * This module does NOT define the canonical type table — it derives it from the
 * JSON file. The JSON is the single source of truth that agents, scripts, and
 * validators all share. To change type metadata, edit the JSON and then update
 * this mirror if the shape of CANONICAL_TYPES changes.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const TYPE_MAP: {
  type_metadata: Record<string, {
    figma_display: string;
    ordering_group: number;
    requires_values: boolean;
  }>;
  normalization: {
    aliases: Record<string, string>;
  };
} = require('../../lib/property-type-map.json');

/**
 * Valid spec property types (enum, text, boolean, instance_swap).
 */
export type SpecPropertyType = 'enum' | 'text' | 'boolean' | 'instance_swap';

/**
 * Coerced spec property type that includes empty string for unknown/invalid types.
 */
export type CoercedSpecPropertyType = SpecPropertyType | '';

/**
 * Type info for a spec property type.
 */
export interface SpecPropertyTypeInfo {
  canonicalType: string;
  figmaDisplay: string;
  orderingGroup: number;
  requiresValues: boolean;
}

/**
 * Build the same shape as the old hardcoded object so callers are unchanged.
 */
const CANONICAL_TYPES = Object.freeze(
  Object.fromEntries(
    Object.entries(TYPE_MAP.type_metadata).map(([specType, meta]) => [
      specType,
      Object.freeze({
        canonicalType: specType,
        figmaDisplay: meta.figma_display,
        orderingGroup: meta.ordering_group,
        requiresValues: meta.requires_values,
      } as SpecPropertyTypeInfo),
    ]),
  ),
) as Record<string, SpecPropertyTypeInfo>;

/**
 * Set of allowed spec property types.
 */
export const SPEC_PROPERTY_ALLOWED_TYPES = new Set(Object.keys(CANONICAL_TYPES));

/**
 * Normalize a raw property type string.
 * Removes comments and trims whitespace.
 */
export function normalizeSpecPropertyType(rawType: unknown): string {
  return String(rawType ?? '')
    .replace(/#.*$/, '')
    .trim()
    .toLowerCase();
}

/**
 * Get type info for a spec property type.
 * Returns null if the type is not recognized.
 */
export function getSpecPropertyTypeInfo(rawType: unknown): SpecPropertyTypeInfo | null {
  const normalized = normalizeSpecPropertyType(rawType);
  return CANONICAL_TYPES[normalized] || null;
}

/**
 * Canonical field order within each property object in a spec YAML.
 * Sourced from component-spec-properties-order.mdc § "Canonical field order".
 * Used by ds:sort-spec and validate:docs (DET01).
 */
export const PROPERTY_FIELD_ORDER = Object.freeze([
  'name',
  'type',
  'values',
  'default',
  'required',
  'description',
]);

/**
 * Check if a property object has fields in canonical order.
 * Only checks fields that are present in the object (subset check).
 */
function propertyHasCanonicalFields(prop: Record<string, unknown>): boolean {
  const keys = Object.keys(prop).filter((k) => PROPERTY_FIELD_ORDER.includes(k));
  const expected = PROPERTY_FIELD_ORDER.filter((k) => k in prop);
  return keys.join(',') === expected.join(',');
}

/**
 * Returns true if all property objects have fields in canonical order.
 * Returns true for non-arrays (vacuous truth).
 * Skips null/undefined elements (YAML noise).
 * Returns false if any non-null element is not a plain object.
 */
export function hasCanonicalPropertyFieldOrder(properties: unknown): boolean {
  if (!Array.isArray(properties)) return true;
  for (const prop of properties) {
    // Skip null/undefined (YAML noise)
    if (prop === null || prop === undefined) continue;
    // Arrays or non-objects should fail
    if (typeof prop !== 'object' || Array.isArray(prop)) return false;
    if (!propertyHasCanonicalFields(prop as Record<string, unknown>)) return false;
  }
  return true;
}

/**
 * Coerce a raw type string to a canonical spec type.
 * Applies normalization aliases (e.g., "variant" → "enum").
 * @returns CoercedSpecPropertyType - valid type or empty string for unknown
 */
export function coerceSpecPropertyType(rawType: unknown): CoercedSpecPropertyType {
  const normalized = normalizeSpecPropertyType(rawType);
  if (!normalized) return '';
  // Figma often uses "variant" for the axis type; specs normalize this to "enum".
  // The alias is declared in TYPE_MAP.normalization.aliases.
  const alias = TYPE_MAP.normalization.aliases[normalized];
  if (alias) return alias as CoercedSpecPropertyType;
  if (CANONICAL_TYPES[normalized]) return normalized as CoercedSpecPropertyType;
  return '';
}

/**
 * Get the list of valid spec property types.
 */
export function getValidSpecPropertyTypes(): SpecPropertyType[] {
  return Object.keys(CANONICAL_TYPES) as SpecPropertyType[];
}
