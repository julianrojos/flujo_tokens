import type { ComponentCatalog } from "@/types/component-catalog";

export interface ComponentTokenDebtRow {
  slug: string;
  displayName: string;
  unresolvedCount: number;
}

function isUnresolvedBinding(binding: {
  token_path?: string | null;
  status?: "resolved" | "unresolved";
}): boolean {
  if (binding.status === "unresolved") return true;
  if (binding.status === "resolved") return false;
  return String(binding.token_path || "").trim().length === 0;
}

export function getTopComponentTokenDebt(
  catalog: ComponentCatalog | null | undefined,
  limit: number,
): ComponentTokenDebtRow[] {
  const normalizedLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0;
  if (!catalog || normalizedLimit === 0) return [];

  return catalog.components
    .map((component) => {
      const unresolvedCount = (component.figma?.token_bindings || []).reduce(
        (count, binding) => count + (isUnresolvedBinding(binding) ? 1 : 0),
        0,
      );
      return {
        slug: component.slug,
        displayName: component.display_name,
        unresolvedCount,
      };
    })
    .filter((row) => row.unresolvedCount > 0)
    .sort((left, right) => {
      const comparison = right.unresolvedCount - left.unresolvedCount;
      if (comparison !== 0) return comparison;
      return left.displayName.localeCompare(right.displayName) || left.slug.localeCompare(right.slug);
    })
    .slice(0, normalizedLimit);
}
