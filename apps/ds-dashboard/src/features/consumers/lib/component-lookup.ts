export interface ComponentLookupRegistryItem {
  display_name: string;
  slug: string;
}

type ComponentLookupMapWithAmbiguity = Record<string, string | null>;

const VARIANT_ASSIGNMENT_SEQUENCE_RE =
  /^[^,\s=]+=[^,]+(?:\s*,\s*[^,\s=]+=[^,]+)*$/;

export function normalizeComponentLookupKey(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "");
}

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
