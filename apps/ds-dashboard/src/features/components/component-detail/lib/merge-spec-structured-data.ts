/**
 * Merge structured Figma data (DB-first) with editorial YAML data
 * 
 * Precedence rules (SC-02):
 * - DB mandates for mechanical/structural fields: layout, variant_visuals, figma metadata
 * - YAML mandates for editorial fields: summary, best_practices, accessibility_notes, etc.
 */

import type { ComponentRegistryItem } from "@/types/component-registry";
import type { PartialComponentSpec } from "ds-types";
import type { SpecLayoutItem } from "ds-types";

const MISSING_DISPLAY_VALUE = "—";

export interface MergedComponentSpec extends PartialComponentSpec {
  // Structured fields from DB (take precedence)
  layout?: SpecLayoutItem[];
  variant_visuals?: Array<{
    name: string;
    properties: Record<string, string>;
    node_id?: string;
  }>;
  figma_metadata?: {
    page_name?: string | null;
    component_set_node_id?: string | null;
    file_url?: string | null;
  };
  // Raw token bindings for reference (not curated)
  figma_token_bindings?: Array<{
    node_id: string;
    node_name: string;
    field: string;
    variable_id: string;
    token_path?: string;
    mode?: string;
  }>;
}

function toDisplayDirection(value: unknown): "Horizontal" | "Vertical" | "—" {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "horizontal") return "Horizontal";
  if (normalized === "vertical") return "Vertical";
  return MISSING_DISPLAY_VALUE;
}

function toDisplayText(value: unknown): string {
  const normalized = String(value || "").trim();
  return normalized || MISSING_DISPLAY_VALUE;
}

function mergeAlignment(horizontal: unknown, vertical: unknown): string {
  const h = String(horizontal || "").trim();
  const v = String(vertical || "").trim();
  if (h && v) return `${h} / ${v}`;
  if (h) return h;
  if (v) return v;
  return MISSING_DISPLAY_VALUE;
}

function toSpecLayout(layoutRows: ComponentRegistryItem["figma"]["layout"]): SpecLayoutItem[] {
  if (!Array.isArray(layoutRows) || layoutRows.length === 0) return [];
  return layoutRows.map((row, index) => {
    const node = String(row.node_name || row.node_id || "").trim() || `Node ${index + 1}`;
    return {
      node,
      direction: toDisplayDirection(row.direction),
      hSizing: toDisplayText(row.h_sizing),
      vSizing: toDisplayText(row.v_sizing),
      alignment: mergeAlignment(row.alignment_h, row.alignment_v),
      itemSpacing:
        Number.isFinite(Number(row.item_spacing))
          ? Number(row.item_spacing)
          : "—",
      padding: row.padding,
    };
  });
}

function toVariantVisuals(
  variants: ComponentRegistryItem["figma"]["variants"],
): MergedComponentSpec["variant_visuals"] {
  if (!Array.isArray(variants)) return undefined;
  return variants.map((variant) => ({
    name: String(variant.name || "").trim() || "Variant",
    properties: variant.properties ?? {},
    node_id: String(variant.node_id || "").trim() || undefined,
  }));
}

function toTokenBindings(
  bindings: ComponentRegistryItem["figma"]["token_bindings"],
): MergedComponentSpec["figma_token_bindings"] {
  if (!Array.isArray(bindings)) return undefined;
  return bindings
    .map((binding) => {
      const node_id = String(binding.node_id || "").trim();
      const node_name = String(binding.node_name || "").trim();
      const field = String(binding.field || "").trim();
      const variable_id = String(binding.variable_id || "").trim();
      if (!node_id || !node_name || !field || !variable_id) return null;
      return {
        node_id,
        node_name,
        field,
        variable_id,
        token_path: String(binding.token_path || "").trim() || undefined,
        mode: String(binding.mode || "").trim() || undefined,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

/**
 * Merge spec with structured data using DB-first precedence
 */
export function mergeSpecWithStructuredData(
  parsedSpec: PartialComponentSpec | null,
  registryItem: ComponentRegistryItem | null,
): MergedComponentSpec {
  const base: MergedComponentSpec = parsedSpec ? { ...parsedSpec } : {};

  if (!registryItem?.figma) {
    return base;
  }

  const figma = registryItem.figma;

  // DB-first: structural fields override YAML
  if (Array.isArray(figma.layout)) {
    base.layout = toSpecLayout(figma.layout);
  }

  if (Array.isArray(figma.variants)) {
    base.variant_visuals = toVariantVisuals(figma.variants) ?? [];
  }

  // Figma metadata (always from DB)
  base.figma_metadata = {
    page_name: figma.page_name ?? null,
    component_set_node_id: figma.component_set_node_id ?? null,
    file_url: figma.file_url ?? null,
  };

  // Raw token bindings (for reference, not curated)
  if (Array.isArray(figma.token_bindings)) {
    base.figma_token_bindings = toTokenBindings(figma.token_bindings) ?? [];
  }

  return base;
}
