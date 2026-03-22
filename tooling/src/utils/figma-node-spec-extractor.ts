import { componentNameToSnakeCase } from "./component-name.js";
import {
  type ExtractedComponentSpec,
  type LayoutInfo,
  type LayoutTreeNode,
  type SpecAnatomyItem,
  type SpecLayoutItem,
  type SpecProperty,
  type SpecVariant,
} from "../types/spec.js";

export type { LayoutInfo, LayoutTreeNode };

/**
 * figma-node-spec-extractor.ts
 *
 * Extracts structured component spec data from a Figma REST API node tree.
 * Extracts: Anatomy, Properties, Visual diffs, Layout auto-layout tree.
 */

export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  children?: FigmaNode[];
  fills?: any[];
  strokes?: any[];
  effects?: any[];
  style?: any;
  absoluteBoundingBox?: { width: number; height: number };
  size?: { width: number; height: number };
  cornerRadius?: number;
  strokeWeight?: number;
  layoutMode?: string;
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  primaryAxisSizingMode?: string;
  counterAxisSizingMode?: string;
  itemSpacing?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  layoutGrow?: number;
  layoutAlign?: string;
  componentId?: string;
  componentPropertyDefinitions?: Record<string, unknown>;
  boundVariables?: Record<string, unknown>;
}

interface FigmaComponentPropertyDefinition {
  type?: string;
  defaultValue?: string | number | boolean;
  variant?: boolean;
}

export interface SpecSections {
  anatomy: string;
  componentApi: string;
  visualSpecifications: string;
  variantsTableRows: string;
  statesMarkdown: string;
}

// ---------------------------------------------------------------------------
// Helpers: color / style
// ---------------------------------------------------------------------------

function toHexByte(value: number): string {
  const clamped = Math.max(0, Math.min(1, Number(value || 0)));
  return Math.round(clamped * 255)
    .toString(16)
    .padStart(2, "0");
}

function figmaColorToHex(colorValue: any): string | null {
  if (!colorValue || typeof colorValue !== "object") return null;
  const r = toHexByte(colorValue.r);
  const g = toHexByte(colorValue.g);
  const b = toHexByte(colorValue.b);
  const a = toHexByte(
    colorValue.a === undefined || colorValue.a === null ? 1 : colorValue.a,
  );
  return a === "ff" ? `#${r}${g}${b}`.toUpperCase() : `#${r}${g}${b}${a}`.toUpperCase();
}

export interface ExtractComponentSpecOptions {
  resolveTokenTraceByVariableId?: (variableId: string) => {
    path: string | null;
    aliasChain: string[];
    resolved: string | null;
  };
}

function findAliasVariableId(value: unknown, depth = 0): string | null {
  if (depth > 8 || value === null || value === undefined) return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const fromItem = findAliasVariableId(item, depth + 1);
      if (fromItem) return fromItem;
    }
    return null;
  }

  if (typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const type = String(record.type || "").trim().toUpperCase();
  const id = String(record.id || record.variableId || "").trim();
  if (type === "VARIABLE_ALIAS" && id) return id;

  for (const nested of Object.values(record)) {
    const fromNested = findAliasVariableId(nested, depth + 1);
    if (fromNested) return fromNested;
  }

  return null;
}

function resolveFillTokenRef(
  node: FigmaNode,
  options?: ExtractComponentSpecOptions,
): { fill: string; chain: string[]; resolved: string | null } | null {
  const resolver = options?.resolveTokenTraceByVariableId;
  if (!resolver) return null;

  const boundVariables = node.boundVariables;
  if (!boundVariables || typeof boundVariables !== "object") return null;

  const candidates: unknown[] = [
    (boundVariables as Record<string, unknown>).fills,
    (boundVariables as Record<string, unknown>).fill,
    (boundVariables as Record<string, unknown>).color,
  ];

  for (const candidate of candidates) {
    const variableId = findAliasVariableId(candidate);
    if (!variableId) continue;
    const trace = resolver(variableId);
    if (trace.path) {
      return {
        fill: trace.path,
        chain: Array.isArray(trace.aliasChain) ? trace.aliasChain : [trace.path],
        resolved: trace.resolved ?? null,
      };
    }
  }

  return null;
}

function extractFill(node: FigmaNode, options?: ExtractComponentSpecOptions): string | null {
  const tokenRef = resolveFillTokenRef(node, options);
  if (tokenRef) return tokenRef.fill;

  const fills = Array.isArray(node.fills) ? node.fills : [];
  const solidFill = fills.find(
    (f) => f.type === "SOLID" && f.visible !== false,
  );
  if (!solidFill) return null;
  return figmaColorToHex(solidFill.color);
}

function extractStroke(node: FigmaNode): string | null {
  const strokes = Array.isArray(node.strokes) ? node.strokes : [];
  const solidStroke = strokes.find(
    (s) => s.type === "SOLID" && s.visible !== false,
  );
  if (!solidStroke) return null;
  return figmaColorToHex(solidStroke.color);
}

function extractTextStyle(node: FigmaNode): string | null {
  if (node.type !== "TEXT") return null;
  const style = node.style || {};
  const parts: string[] = [];
  if (style.fontFamily) parts.push(style.fontFamily);
  if (style.fontWeight && style.fontWeight !== 400) {
    parts.push(style.fontWeight >= 700 ? "Bold" : `w${style.fontWeight}`);
  }
  if (style.fontSize) parts.push(`${style.fontSize}`);
  if (style.textCase === "UPPER") parts.push("Uppercase");
  if (style.textCase === "LOWER") parts.push("Lowercase");
  return parts.length > 0 ? parts.join("/") : null;
}

function extractEffects(node: FigmaNode): string[] {
  const effects = Array.isArray(node.effects) ? node.effects : [];
  return effects
    .filter((e) => e.visible !== false)
    .map((effect) => {
      if (effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW") {
        const ox = effect.offset?.x ?? 0;
        const oy = effect.offset?.y ?? 0;
        const radius = effect.radius ?? 0;
        const spread = effect.spread ?? 0;
        const color = figmaColorToHex(effect.color) || "#000000";
        const kind = effect.type === "DROP_SHADOW" ? "Drop shadow" : "Inner shadow";
        return `${kind} ${ox}px ${oy}px ${radius}px ${spread}px ${color}`;
      }
      if (effect.type === "LAYER_BLUR") {
        return `Blur ${effect.radius ?? 0}px`;
      }
      return effect.type;
    });
}

function extractDimensions(node: FigmaNode): { width?: number; height?: number } {
  const result: { width?: number; height?: number } = {};
  const box = node.absoluteBoundingBox || node.size;
  if (box) {
    if (box.width !== undefined) result.width = Math.round(box.width);
    if (box.height !== undefined) result.height = Math.round(box.height);
  }
  return result;
}

function extractLayoutInfo(node: FigmaNode): LayoutInfo {
  const layout: LayoutInfo = {};
  if (node.layoutMode) layout.layoutMode = node.layoutMode;
  if (node.primaryAxisAlignItems) layout.primaryAxisAlignItems = node.primaryAxisAlignItems;
  if (node.counterAxisAlignItems) layout.counterAxisAlignItems = node.counterAxisAlignItems;
  if (node.primaryAxisSizingMode) layout.primaryAxisSizingMode = node.primaryAxisSizingMode;
  if (node.counterAxisSizingMode) layout.counterAxisSizingMode = node.counterAxisSizingMode;
  if (node.itemSpacing !== undefined) layout.itemSpacing = node.itemSpacing;
  if (node.paddingTop !== undefined) layout.paddingTop = node.paddingTop;
  if (node.paddingRight !== undefined) layout.paddingRight = node.paddingRight;
  if (node.paddingBottom !== undefined) layout.paddingBottom = node.paddingBottom;
  if (node.paddingLeft !== undefined) layout.paddingLeft = node.paddingLeft;
  if (node.layoutGrow !== undefined) layout.layoutGrow = node.layoutGrow;
  if (node.layoutAlign) layout.layoutAlign = node.layoutAlign;
  return layout;
}

function extractAnatomyItem(
  node: FigmaNode,
  options?: ExtractComponentSpecOptions,
): SpecAnatomyItem {
  const nodeId = String(node.id || "").trim();
  if (!nodeId) {
    throw new Error(
      `Missing Figma node id while extracting anatomy item: ${node.name || "Unnamed"}`,
    );
  }

  const item: SpecAnatomyItem = {
    id: nodeId,
    name: node.name || "Unnamed",
    type: node.type || "UNKNOWN",
  };

  const dims = extractDimensions(node);
  if (dims.width) item.width = dims.width;
  if (dims.height) item.height = dims.height;

  const fillTrace = resolveFillTokenRef(node, options);
  const fill = fillTrace?.fill ?? extractFill(node, options);
  if (fill) item.fill = fill;
  if (fillTrace && fillTrace.chain.length > 0) {
    item.fill_alias_chain = fillTrace.chain;
  }
  if (fillTrace?.resolved) {
    item.fill_resolved = fillTrace.resolved;
  }

  const stroke = extractStroke(node);
  if (stroke) item.stroke = stroke;

  if (node.cornerRadius !== undefined) item.cornerRadius = node.cornerRadius;

  const effects = extractEffects(node);
  if (effects.length > 0) item.effects = effects;

  const textStyle = extractTextStyle(node);
  if (textStyle) item.textStyle = textStyle;

  if (node.children && node.children.length > 0) {
    item.children = node.children.map((child) => extractAnatomyItem(child, options));
  }

  return item;
}

function extractProperties(node: FigmaNode): SpecProperty[] {
  const properties: SpecProperty[] = [];
  const propDefs = node.componentPropertyDefinitions || {};

  for (const [name, def] of Object.entries(propDefs)) {
    if (!def || typeof def !== "object") continue;
    const typedDef = def as FigmaComponentPropertyDefinition;
    properties.push({
      name,
      type: typedDef.type || "unknown",
      default: typedDef.defaultValue,
      variant: Boolean(typedDef.variant),
      required: !typedDef.variant,
    });
  }

  // Sort: enum > text > boolean > instance_swap
  const typePriority: Record<string, number> = {
    ENUM: 1,
    TEXT: 2,
    BOOLEAN: 3,
    INSTANCE_SWAP: 4,
  };
  properties.sort((a, b) => {
    const aPriority = typePriority[a.type] || 99;
    const bPriority = typePriority[b.type] || 99;
    if (aPriority !== bPriority) return aPriority - bPriority;
    return a.name.localeCompare(b.name);
  });

  return properties;
}

function extractVariantProperties(node: FigmaNode): string[] {
  const props = new Set<string>();
  const propDefs = node.componentPropertyDefinitions || {};

  for (const [name, def] of Object.entries(propDefs)) {
    if (!def || typeof def !== "object") continue;
    const typedDef = def as FigmaComponentPropertyDefinition;
    if (Boolean(typedDef.variant)) {
      props.add(name);
    }
  }

  return Array.from(props).sort();
}

function buildLayoutTree(node: FigmaNode): LayoutTreeNode {
  const tree: LayoutTreeNode = {
    name: node.name || "Unnamed",
    type: node.type || "UNKNOWN",
  };

  const dims = extractDimensions(node);
  if (dims.width) tree.width = dims.width;
  if (dims.height) tree.height = dims.height;

  const layout = extractLayoutInfo(node);
  if (Object.keys(layout).length > 0) {
    tree.layout = layout;
  }

  if (node.children && node.children.length > 0) {
    tree.children = node.children.map(buildLayoutTree);
  }

  return tree;
}

function flattenLayoutTree(node: LayoutTreeNode): SpecLayoutItem[] {
  const current: SpecLayoutItem = {
    node: node.name,
    direction: node.layout?.layoutMode || "NONE",
    alignment:
      node.layout?.primaryAxisAlignItems ||
      node.layout?.counterAxisAlignItems ||
      "AUTO",
    hSizing: node.layout?.primaryAxisSizingMode || "FIXED",
    vSizing: node.layout?.counterAxisSizingMode || "FIXED",
  };

  if (node.layout?.itemSpacing !== undefined) {
    current.itemSpacing = node.layout.itemSpacing;
  }

  const hasPadding =
    node.layout?.paddingTop !== undefined ||
    node.layout?.paddingRight !== undefined ||
    node.layout?.paddingBottom !== undefined ||
    node.layout?.paddingLeft !== undefined;
  if (hasPadding) {
    current.padding = {
      top: node.layout?.paddingTop,
      right: node.layout?.paddingRight,
      bottom: node.layout?.paddingBottom,
      left: node.layout?.paddingLeft,
    };
  }

  const children = Array.isArray(node.children)
    ? node.children.flatMap(flattenLayoutTree)
    : [];

  return [current, ...children];
}

function buildVariantSpecs(properties: SpecProperty[]): SpecVariant[] {
  return properties
    .filter((property) => property.variant)
    .map((property) => ({
      name: property.name,
      type: "variant",
    }));
}

/**
 * Extract a complete component spec from a Figma node tree.
 */
export function extractComponentSpec(
  node: FigmaNode,
  options?: ExtractComponentSpecOptions,
): ExtractedComponentSpec {
  const anatomy = node.children ? node.children.map((child) => extractAnatomyItem(child, options)) : [];
  const properties = extractProperties(node);
  const layoutTree = buildLayoutTree(node);
  const variantProperties = extractVariantProperties(node);
  const layout = flattenLayoutTree(layoutTree);
  const variants = buildVariantSpecs(properties);

  return {
    anatomy,
    properties,
    layoutTree,
    layout,
    variants,
    variantProperties,
  };
}

/**
 * Generate markdown sections for a component spec.
 */
export function generateSpecSections(spec: ExtractedComponentSpec): SpecSections {
  const anatomy = spec.anatomy.map((item) => `- **${item.name}** (${item.type}): ${item.width || "?"}×${item.height || "?"}`).join("\n");

  const componentApi = spec.properties.map((prop) => {
    const variantMark = prop.variant ? " *(variant)*" : "";
    return `- **${prop.name}**: \`${prop.type}\`${variantMark}`;
  }).join("\n");

  const visualSpecifications = spec.anatomy
    .filter((item) => item.fill || item.stroke || item.effects)
    .map((item) => {
      const parts: string[] = [];
      if (item.fill) parts.push(`Fill: ${item.fill}`);
      if (item.stroke) parts.push(`Stroke: ${item.stroke}`);
      if (item.effects && item.effects.length > 0) parts.push(`Effects: ${item.effects.join(", ")}`);
      return `- **${item.name}**: ${parts.join(" | ") || "No styles"}`;
    }).join("\n") || "No styled elements found.";

  const variantsTableRows = spec.variantProperties.length > 0
    ? spec.variantProperties.map((prop) => `| ${prop} | Token | Fallback | TBD |`).join("\n")
    : "| N/A | - | - | No variants found |";

  const statesMarkdown = "- [ ] Define interactive states (hover, focus, active, disabled)";

  return {
    anatomy: anatomy || "No anatomy items found.",
    componentApi: componentApi || "No properties found.",
    visualSpecifications,
    variantsTableRows,
    statesMarkdown,
  };
}

/**
 * Build enriched markdown sections from extracted spec.
 */
export function buildEnrichedMarkdownSections(spec: ExtractedComponentSpec): {
  anatomy: string;
  componentApi: string;
  visualSpecifications: string;
  variantsTableRows: string;
  statesMarkdown: string;
} {
  return generateSpecSections(spec);
}

/**
 * Generate a markdown spec template from extracted data.
 */
export function generateSpecMarkdown(
  spec: ExtractedComponentSpec,
  componentName: string,
  nodeId?: string,
  nodeUrl?: string
): string {
  const safeName = componentNameToSnakeCase(componentName);
  const safeUrl = nodeUrl || "TBD";

  const sections = generateSpecSections(spec);

  const propsForOverview = spec.variantProperties.length > 0
    ? spec.variantProperties.join(", ")
    : "TBD";

  return `---
doc_type: component
doc_status: draft
figma:
  file_url: ${safeUrl}
  last_verified: TBD
  node_id: ${nodeId || "TBD"}
component_name: ${safeName}
---

# ${componentName}

## Overview

- Purpose: TBD
- Figma component set: \`${safeName}\`.
- Variant properties: ${propsForOverview || "TBD"}.
- Source: [${safeName} in Figma](${safeUrl}).

### Visual Proof

- Screenshot: TBD
- Source node: ${nodeId || "TBD"}
- Artifact: TBD

## Anatomy

${sections.anatomy}

## Component API

${sections.componentApi}

## Visual Specifications

${sections.visualSpecifications}

## Variants

| Variant | Token | Fallback | Notes |
| --- | --- | --- | --- |
${sections.variantsTableRows}

## States

${sections.statesMarkdown}

## Usage Guidelines

### When to use

- TBD

### When not to use

- TBD

## Content Guidelines

- Keep labels concise and task-oriented.
- Preserve consistent naming across variant values.

## Accessibility

- ARIA: TBD
- Keyboard: TBD
- Focus: \`Semantic.Color.Focus-Outline.Inner\` (\`#FFFFFF\`) and \`Semantic.Color.Focus-Outline.Outer\` (\`#567680\`).
- Hit area: \`A11y.A11y.Dimension.Min-Hit-Area\` (\`24px\`) and \`Primitives.Dimension.A11y.Min-Hit-Area-Mobile-AAA\` (\`48px\`).
- Contrast: TBD (pending audit)

## Related Components

- [TBD](tbd.md): TBD

## Gaps / TBD

- [ ] [CONTENT_UNKNOWN] Complete usage, accessibility, and token mapping details with product evidence.
`;
}

/**
 * Render enriched markdown seed from extracted spec data.
 */
export function renderEnrichedMarkdownSeed(opts: {
  slug?: string;
  displayName?: string;
  nodeUrl?: string;
  nodeId?: string;
  spec?: ExtractedComponentSpec;
}): string {
  const { slug, displayName, nodeUrl, nodeId, spec } = opts;
  const safeName = displayName || spec?.name || "Component";
  const properties = spec?.properties ?? [];
  const propsForOverview = properties
    .filter((property) => property.variant)
    .map((property) => property.name)
    .join(", ");
  const safeUrl = nodeUrl || "TBD";

  return `---
doc_type: component
doc_status: draft
figma:
  file_url: ${safeUrl}
  page: TBD
  component: ${safeName}
  component_set_node_id: ${nodeId || "TBD"}
  last_verified: TBD
---

# ${safeName}

Auto-generated component documentation from Figma capture.

## Overview

- Purpose: TBD
- Figma component set: \`${safeName}\`.
- Variant properties: ${propsForOverview || "TBD"}.
- Source: [${safeName} in Figma](${safeUrl}).

### Visual Proof

- Screenshot: TBD
- Source node: ${nodeId || "TBD"}
- Artifact: TBD

## Anatomy

${renderAnatomyMarkdown(spec?.anatomy)}

## Component API

${renderPropertiesTable(spec?.properties)}

## Visual Specifications

${renderVariantSpecs(spec?.variants)}

## Variants

| Variant | Token | Fallback | Notes |
| --- | --- | --- | --- |
${renderVariantRows(spec?.variants)}

## States

${renderStatesMarkdown(spec?.properties)}

## Usage Guidelines

### When to use

- TBD

### When not to use

- TBD

## Content Guidelines

- Keep labels concise and task-oriented.
- Preserve consistent naming across variant values.

## Accessibility

- ARIA: TBD
- Keyboard: TBD
- Focus: \`Semantic.Color.Focus-Outline.Inner\` (\`#FFFFFF\`) and \`Semantic.Color.Focus-Outline.Outer\` (\`#567680\`).
- Hit area: \`A11y.A11y.Dimension.Min-Hit-Area\` (\`24px\`) and \`Primitives.Dimension.A11y.Min-Hit-Area-Mobile-AAA\` (\`48px\`).
- Contrast: TBD (pending audit)

## Related Components

- [TBD](tbd.md): TBD

## Gaps / TBD

- [ ] [CONTENT_UNKNOWN] Complete usage, accessibility, and token mapping details with product evidence.
`;
}

function renderAnatomyMarkdown(anatomy: SpecAnatomyItem[] | undefined): string {
  if (!Array.isArray(anatomy) || anatomy.length === 0) return "No anatomy items found.";
  return anatomy
    .map(
      (item) =>
        `- **${item.name || "Unknown"}** (${item.type || "unknown"}): ${item.width || "?"}×${item.height || "?"}`,
    )
    .join("\n");
}

function renderPropertiesTable(properties: SpecProperty[] | undefined): string {
  if (!Array.isArray(properties) || properties.length === 0) {
    return "| N/A | - | - | - | - | - |";
  }
  return properties
    .map(
      (property) =>
        `| ${property.name || "TBD"} | ${property.type || "unknown"} | ${property.default ?? "-"} | ${property.required ? "Yes" : "No"} | ${property.description || "-"} | TBD |`,
    )
    .join("\n");
}

function renderVariantSpecs(variants: SpecVariant[] | undefined): string {
  if (!Array.isArray(variants) || variants.length === 0) return "- `TBD`";
  return variants
    .map(
      (variant) =>
        `- \`${variant.name || "TBD"}\`: ${Array.isArray(variant.values) ? variant.values.join(", ") : "TBD"}`,
    )
    .join("\n");
}

function renderVariantRows(variants: SpecVariant[] | undefined): string {
  if (!Array.isArray(variants) || variants.length === 0) return "| N/A | - | - | No variants found |";
  return variants
    .map((variant) => `| ${variant.name || "TBD"} | Token | Fallback | TBD |`)
    .join("\n");
}

function renderStatesMarkdown(properties: SpecProperty[] | undefined): string {
  if (!Array.isArray(properties) || properties.length === 0) return "- Default: `TBD`.\n- Other states: `TBD`.";
  const stateProps = properties.filter((property) =>
    String(property.name || "")
      .toLowerCase()
      .includes("state"),
  );
  if (stateProps.length === 0) return "- Default: `TBD`.\n- Other states: `TBD`.";
  return stateProps
    .map((property) => {
      const values = (property as { values?: unknown }).values;
      return `- ${property.name}: \`${Array.isArray(values) ? values.join("`, `") : "TBD"}\``;
    })
    .join("\n");
}
