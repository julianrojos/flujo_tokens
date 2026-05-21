/**
 * Component Identity Utilities
 *
 * Shared functions for component name parsing, slug resolution, and lookup.
 * Extracted from features/consumers/lib/component-lookup.ts to enable
 * cross-feature usage (e.g., features/components).
 */

export interface ComponentLookupRegistryItem {
  display_name: string;
  slug: string;
}

export interface SplitComponentNameResult {
  parentName: string;
  variantLabel: string;
  isBareVariantAssignment: boolean;
}

type ComponentLookupMapWithAmbiguity = Record<string, string | null>;

const VARIANT_ASSIGNMENT_SEQUENCE_RE =
  /^[^,\s=]+=[^,]+(?:\s*,\s*[^,\s=]+=[^,]+)*$/;

/**
 * Normalize a string for case-insensitive, diacritic-insensitive comparison.
 */
export function normalizeComponentLookupKey(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "");
}

/**
 * Build a slug fallback from a display name.
 */
export function buildComponentSlugFallback(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Extract parent component alias from a full component name.
 * Handles both slash and comma-based variant naming conventions.
 */
export function extractComponentParentAlias(value: string): string {
  const normalized = String(value || "").trim();
  if (!normalized) return "";

  const slashIdx = normalized.indexOf("/");
  if (slashIdx !== -1) {
    return normalized.slice(0, slashIdx).trim();
  }

  const commaIdx = normalized.indexOf(",");
  if (commaIdx !== -1) {
    const afterComma = normalized.slice(commaIdx + 1).trim();
    if (VARIANT_ASSIGNMENT_SEQUENCE_RE.test(afterComma)) {
      return normalized.slice(0, commaIdx).trim();
    }
  }

  return normalized;
}

/**
 * Split a component name into parent and variant parts.
 * Supports both slash and comma-based variant naming conventions.
 */
export function splitComponentName(componentName: string): SplitComponentNameResult {
  const normalized = String(componentName || "").trim();

  // Canonical Figma naming: "Button/Size=Large,State=Hover"
  const slashIdx = normalized.indexOf("/");
  if (slashIdx !== -1) {
    return {
      parentName: normalized.slice(0, slashIdx),
      variantLabel: normalized.slice(slashIdx + 1),
      isBareVariantAssignment: false,
    };
  }

  // Alternate naming: "Button, Size=Large, State=Hover"
  const commaIdx = normalized.indexOf(",");
  const afterComma = commaIdx !== -1 ? normalized.slice(commaIdx + 1).trim() : "";
  if (commaIdx !== -1 && VARIANT_ASSIGNMENT_SEQUENCE_RE.test(afterComma)) {
    return {
      parentName: normalized.slice(0, commaIdx).trim(),
      variantLabel: afterComma,
      isBareVariantAssignment: false,
    };
  }

  // Bare variant assignment with no parent prefix: "State=Active", "Size=Small", etc.
  // The component has no identifiable parent name — signal this with an empty parentName.
  if (VARIANT_ASSIGNMENT_SEQUENCE_RE.test(normalized)) {
    return { parentName: "", variantLabel: normalized, isBareVariantAssignment: true };
  }

  return { parentName: normalized, variantLabel: "", isBareVariantAssignment: false };
}

function addLookupValue(
  target: ComponentLookupMapWithAmbiguity,
  key: string,
  slug: string,
): void {
  if (!key) return;
  if (!(key in target)) {
    target[key] = slug;
    return;
  }
  if (target[key] !== slug) {
    target[key] = null;
  }
}

/**
 * Build a lookup map from registry items for slug resolution.
 */
export function buildComponentLookupMap(
  items: ReadonlyArray<ComponentLookupRegistryItem>,
): Record<string, string> {
  const exactLookupWithAmbiguity: ComponentLookupMapWithAmbiguity = {};
  const aliasLookupWithAmbiguity: ComponentLookupMapWithAmbiguity = {};

  for (const item of items) {
    const slug = String(item.slug || "").trim();
    if (!slug) continue;

    const displayNameKey = normalizeComponentLookupKey(item.display_name);
    const slugKey = normalizeComponentLookupKey(slug);
    const parentAliasKey = normalizeComponentLookupKey(
      extractComponentParentAlias(item.display_name),
    );
    const exactKeys = [displayNameKey, slugKey].filter(Boolean);

    for (const key of exactKeys) {
      addLookupValue(exactLookupWithAmbiguity, key, slug);
    }

    if (!parentAliasKey || exactKeys.includes(parentAliasKey)) continue;
    addLookupValue(aliasLookupWithAmbiguity, parentAliasKey, slug);
  }

  return Object.fromEntries(
    [
      ...Object.entries(aliasLookupWithAmbiguity),
      ...Object.entries(exactLookupWithAmbiguity),
    ].flatMap(([key, slug]) => (slug ? [[key, slug]] : [])),
  );
}

/**
 * Resolve a known component slug from a parent/variant name pair.
 */
export function resolveKnownComponentSlug(args: {
  lookup: Record<string, string>;
  parentName: string;
  variantName: string;
}): string | undefined {
  const parentNameKey = normalizeComponentLookupKey(args.parentName);
  const variantNameKey = normalizeComponentLookupKey(args.variantName);
  const directMatch =
    (parentNameKey ? args.lookup[parentNameKey] : undefined) ||
    (variantNameKey ? args.lookup[variantNameKey] : undefined);
  if (directMatch) return directMatch;

  const fallbackSlug = buildComponentSlugFallback(args.parentName);
  if (!fallbackSlug) return undefined;
  const fallbackKey = normalizeComponentLookupKey(fallbackSlug);
  return fallbackKey ? args.lookup[fallbackKey] : undefined;
}
