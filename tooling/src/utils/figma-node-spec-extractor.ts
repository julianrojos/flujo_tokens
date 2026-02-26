import { componentNameToSnakeCase } from "./component-name.js";
import { type SpecAnatomyItem, type SpecProperty } from "../types/spec.js";

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
  componentPropertyDefinitions?: Record<string, any>;
}

// Types imported from ../types/spec.js

export interface ExtractedComponentSpec {
  anatomy: SpecAnatomyItem[];
  properties: SpecProperty[];
  layoutTree: LayoutTreeNode;
  variantProperties: string[];
}

export interface SpecSections {
  anatomy: string;
  componentApi: string;
  visualSpecifications: string;
  variantsTableRows: string;
  statesMarkdown: string;
}

export interface LayoutInfo {
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
}

export interface LayoutTreeNode {
  // name and type are required - partial specs without these are invalid
  name: string;
  type: string;
  width?: number;
  height?: number;
  layout?: LayoutInfo;
  children?: LayoutTreeNode[];
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

function extractFill(node: FigmaNode): string | null {
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

function extractAnatomyItem(node: FigmaNode): SpecAnatomyItem {
  const item: SpecAnatomyItem = {
    name: node.name || "Unnamed",
    type: node.type || "UNKNOWN",
  };

  const dims = extractDimensions(node);
  if (dims.width) item.width = dims.width;
  if (dims.height) item.height = dims.height;

  const fill = extractFill(node);
  if (fill) item.fill = fill;

  const stroke = extractStroke(node);
  if (stroke) item.stroke = stroke;

  if (node.cornerRadius !== undefined) item.cornerRadius = node.cornerRadius;

  const effects = extractEffects(node);
  if (effects.length > 0) item.effects = effects;

  const textStyle = extractTextStyle(node);
  if (textStyle) item.textStyle = textStyle;

  if (node.children && node.children.length > 0) {
    item.children = node.children.map(extractAnatomyItem);
  }

  return item;
}

function extractProperties(node: FigmaNode): SpecProperty[] {
  const properties: SpecProperty[] = [];
  const propDefs = node.componentPropertyDefinitions || {};

  for (const [name, def] of Object.entries(propDefs)) {
    if (!def || typeof def !== "object") continue;
    const typedDef = def as Record<string, any>;
    properties.push({
      name,
      type: typedDef.type || "unknown",
      defaultValue: typedDef.defaultValue,
      variant: typedDef.variant || false,
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
    const typedDef = def as Record<string, any>;
    if (typedDef.variant) {
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

/**
 * Extract a complete component spec from a Figma node tree.
 */
export function extractComponentSpec(node: FigmaNode): ExtractedComponentSpec {
  const anatomy = node.children ? node.children.map(extractAnatomyItem) : [];
  const properties = extractProperties(node);
  const layoutTree = buildLayoutTree(node);
  const variantProperties = extractVariantProperties(node);

  return {
    anatomy,
    properties,
    layoutTree,
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
