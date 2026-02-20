const CANONICAL_TYPES = Object.freeze({
  enum: {
    canonicalType: "enum",
    figmaDisplayType: "VARIANT",
    orderingGroup: 1,
    requiresValues: true,
  },
  text: {
    canonicalType: "text",
    figmaDisplayType: "TEXT",
    orderingGroup: 2,
    requiresValues: false,
  },
  boolean: {
    canonicalType: "boolean",
    figmaDisplayType: "BOOLEAN",
    orderingGroup: 3,
    requiresValues: false,
  },
  instance_swap: {
    canonicalType: "instance_swap",
    figmaDisplayType: "INSTANCE_SWAP",
    orderingGroup: 4,
    requiresValues: false,
  },
});

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
  if (normalized === "variant") return "enum";
  if (CANONICAL_TYPES[normalized]) return normalized;
  return "";
}

