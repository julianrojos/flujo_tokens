import { normalizeResolvedValueFilter } from "@/lib/token-value-normalize";

export type CollectionPageScope = "tokens" | "components";

export interface CollectionPageFilterState {
  isFiltered: boolean;
  description?: string;
}

function normalizeQueryValue(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase();
}

export function resolveCollectionPageFilter(
  scope: CollectionPageScope,
  group: string | null | undefined,
  value: string | null | undefined,
): CollectionPageFilterState {
  const normalizedGroup = String(group || "").trim();
  const normalizedValue = normalizeQueryValue(value);

  if (scope === "tokens") {
    if (normalizedGroup === "resolvedValue" && normalizeResolvedValueFilter(normalizedValue)) {
      return {
        isFiltered: true,
        description: "Token collection filtered by resolved value",
      };
    }
    if (normalizedGroup === "aliases" && normalizedValue === "alias") {
      return {
        isFiltered: true,
        description: "Token collection filtered by aliases",
      };
    }
    if (normalizedGroup === "usageCount" && normalizedValue === "unused") {
      return {
        isFiltered: true,
        description: "Token collection filtered by unused tokens",
      };
    }
    return { isFiltered: false };
  }

  if (normalizedGroup === "multiVariant" && normalizedValue === "multi") {
    return {
      isFiltered: true,
      description: "Component collection filtered by multi-variant components",
    };
  }
  if (normalizedGroup === "docsCoverage" && normalizedValue === "with-spec") {
    return {
      isFiltered: true,
      description: "Component collection filtered by documentation coverage",
    };
  }
  return { isFiltered: false };
}
