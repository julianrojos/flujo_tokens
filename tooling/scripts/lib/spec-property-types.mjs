/**
 * Runtime mirror of tooling/lib/property-type-map.json.
 *
 * This module does NOT define the canonical type table — it derives it from the
 * JSON file. The JSON is the single source of truth that agents, scripts, and
 * validators all share. To change type metadata, edit the JSON and then update
 * this mirror if the shape of CANONICAL_TYPES changes.
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const TYPE_MAP = require("../../lib/property-type-map.json");

// Build the same shape as the old hardcoded object so callers are unchanged.
const CANONICAL_TYPES = Object.freeze(
  Object.fromEntries(
    Object.entries(TYPE_MAP.type_metadata).map(([specType, meta]) => [
      specType,
      Object.freeze({
        canonicalType:    specType,
        figmaDisplayType: meta.figma_display,
        orderingGroup:    meta.ordering_group,
        requiresValues:   meta.requires_values,
      }),
    ]),
  ),
);

export const SPEC_PROPERTY_TYPE_DECISION_TABLE = CANONICAL_TYPES;

export const SPEC_PROPERTY_ALLOWED_TYPES = new Set(Object.keys(CANONICAL_TYPES));

export function normalizeSpecPropertyType(rawType) {
  return String(rawType ?? "")
    .replace(/#.*$/, "")
    .trim()
    .toLowerCase();
}

export function getSpecPropertyTypeInfo(rawType) {
  const normalized = normalizeSpecPropertyType(rawType);
  return CANONICAL_TYPES[normalized] || null;
}

export function coerceSpecPropertyType(rawType) {
  const normalized = normalizeSpecPropertyType(rawType);
  if (!normalized) return "";
  // Figma often uses "variant" for the axis type; specs normalize this to "enum".
  // The alias is declared in TYPE_MAP.normalization.aliases.
  const alias = TYPE_MAP.normalization.aliases[normalized];
  if (alias) return alias;
  if (CANONICAL_TYPES[normalized]) return normalized;
  return "";
}
