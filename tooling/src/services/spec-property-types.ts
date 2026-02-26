/**
 * Spec Property Types
 *
 * Sourced from tooling/lib/property-type-map.json
 */

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const TYPE_MAP = require('../../lib/property-type-map.json');

export type SpecPropertyType = 'enum' | 'text' | 'boolean' | 'instance_swap';

/**
 * Coerced spec property type that includes empty string for unknown/invalid types.
 * This allows coerceSpecPropertyType to return a safe default without null/undefined.
 */
export type CoercedSpecPropertyType = SpecPropertyType | '';

export interface SpecPropertyTypeInfo {
  orderingGroup: number;
  requiresValues: boolean;
  defaultFormat: string;
  valuesField: string;
  figmaDisplay: string;
}

export const PROPERTY_FIELD_ORDER = Object.freeze([
  'name',
  'type',
  'values',
  'default',
  'required',
  'description',
]);

/**
 * Coerce a raw type string to a canonical SpecPropertyType.
 * Returns empty string if the type is invalid or unrecognized.
 */
export function coerceSpecPropertyType(raw?: string): CoercedSpecPropertyType {
  if (!raw) return '';
  const normalized = String(raw).trim().toLowerCase();

  // Handle aliases
  if (TYPE_MAP.normalization.aliases[normalized]) {
    return TYPE_MAP.normalization.aliases[normalized] as CoercedSpecPropertyType;
  }

  // Check if it's a valid canonical type
  if (TYPE_MAP.type_metadata[normalized]) {
    return normalized as CoercedSpecPropertyType;
  }

  // Try Figma to Spec mapping
  const upperNormalized = normalized.toUpperCase();
  if (TYPE_MAP.figma_to_spec[upperNormalized]) {
    return TYPE_MAP.figma_to_spec[upperNormalized] as CoercedSpecPropertyType;
  }

  return '';
}

/**
 * Get metadata for a given SpecPropertyType.
 * Returns null if the type is empty or invalid.
 */
export function getSpecPropertyTypeInfo(type: CoercedSpecPropertyType): SpecPropertyTypeInfo | null {
  if (!type) return null;

  const meta = TYPE_MAP.type_metadata[type];
  if (!meta) return null;

  return {
    orderingGroup: meta.ordering_group,
    requiresValues: meta.requires_values,
    defaultFormat: meta.default_format,
    valuesField: meta.values_field,
    figmaDisplay: meta.figma_display,
  };
}

/**
 * Get all valid SpecPropertyTypes.
 */
export function getValidSpecPropertyTypes(): SpecPropertyType[] {
  return Object.keys(TYPE_MAP.type_metadata) as SpecPropertyType[];
}

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
 * Check if properties array has canonical field order.
 * - Skips null/undefined elements (permissive for YAML noise).
 * - Fails if any element is not a plain object (strict on data structure).
 * - Returns true for non-arrays (vacuous truth).
 */
export function hasCanonicalPropertyFieldOrder(properties: unknown): boolean {
  if (!Array.isArray(properties)) return true;

  for (const prop of properties) {
    // Skip null/undefined (YAML noise: empty lines, comments, etc.)
    if (!prop) continue;

    // Fail on non-object or array (data corruption, not noise)
    if (typeof prop !== 'object' || Array.isArray(prop)) return false;

    const keys = Object.keys(prop);
    const expectedOrder = PROPERTY_FIELD_ORDER.filter((field) => keys.includes(field));
    const actualOrder = keys.filter((key) => PROPERTY_FIELD_ORDER.includes(key));

    for (let i = 0; i < expectedOrder.length; i++) {
      if (expectedOrder[i] !== actualOrder[i]) return false;
    }
  }

  return true;
}
