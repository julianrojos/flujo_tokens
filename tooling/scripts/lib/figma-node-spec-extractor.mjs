/**
 * figma-node-spec-extractor.mjs
 *
 * Extracts structured component spec data from a Figma REST API node tree:
 *   - Anatomy: child parts with dimensions, text styles, instance references
 *   - Properties: from componentPropertyDefinitions
 *   - Per-variant visual diffs: fills, effects, text styles per variant
 *   - Layout: auto-layout tree with direction, alignment, sizing, spacing, padding
 *
 * Usage:
 *   import { extractComponentSpec } from "./figma-node-spec-extractor.mjs";
 *   const spec = extractComponentSpec(nodeDocument);
 */

/**
 * @typedef {import("ds-types").SpecAnatomyItem} SpecAnatomyItem
 * @typedef {import("ds-types").SpecProperty} SpecProperty
 */

// ---------------------------------------------------------------------------
// Helpers: color / style
// ---------------------------------------------------------------------------

function toHexByte(value) {
  const clamped = Math.max(0, Math.min(1, Number(value || 0)));
  return Math.round(clamped * 255)
    .toString(16)
    .padStart(2, "0");
}

function figmaColorToHex(colorValue) {
  if (!colorValue || typeof colorValue !== "object") return null;
  const r = toHexByte(colorValue.r);
  const g = toHexByte(colorValue.g);
  const b = toHexByte(colorValue.b);
  const a = toHexByte(
    colorValue.a === undefined || colorValue.a === null ? 1 : colorValue.a,
  );
  return a === "ff" ? `#${r}${g}${b}`.toUpperCase() : `#${r}${g}${b}${a}`.toUpperCase();
}

function extractFill(node) {
  const fills = Array.isArray(node.fills) ? node.fills : [];
  const solidFill = fills.find(
    (f) => f.type === "SOLID" && f.visible !== false,
  );
  if (!solidFill) return null;
  return figmaColorToHex(solidFill.color);
}

function extractStroke(node) {
  const strokes = Array.isArray(node.strokes) ? node.strokes : [];
  const solidStroke = strokes.find(
    (s) => s.type === "SOLID" && s.visible !== false,
  );
  if (!solidStroke) return null;
  return figmaColorToHex(solidStroke.color);
}

function extractTextStyle(node) {
  if (node.type !== "TEXT") return null;
  const style = node.style || {};
  const parts = [];
  if (style.fontFamily) parts.push(style.fontFamily);
  if (style.fontWeight && style.fontWeight !== 400) {
    parts.push(style.fontWeight >= 700 ? "Bold" : `w${style.fontWeight}`);
  }
  if (style.fontSize) parts.push(`${style.fontSize}`);
  if (style.textCase === "UPPER") parts.push("Uppercase");
  if (style.textCase === "LOWER") parts.push("Lowercase");
  return parts.length > 0 ? parts.join("/") : null;
}

function extractEffects(node) {
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
        const kind =
          effect.type === "DROP_SHADOW" ? "Drop shadow" : "Inner shadow";
        return `${kind} ${ox}px ${oy}px ${radius}px ${spread}px ${color}`;
      }
      if (effect.type === "LAYER_BLUR") {
        return `Blur ${effect.radius ?? 0}px`;
      }
      return effect.type;
    });
}

function extractDimensions(node) {
  const result = {};
  const box = node.absoluteBoundingBox || node.size;
  if (box) {
    if (box.width !== undefined) result.width = Math.round(box.width);
    if (box.height !== undefined) result.height = Math.round(box.height);
  }
  if (node.cornerRadius !== undefined && node.cornerRadius > 0) {
    result.borderRadius = node.cornerRadius;
  }
  if (node.strokeWeight !== undefined && node.strokeWeight > 0) {
    result.borderWeight = node.strokeWeight;
  }
  if (
    result.width &&
    result.height &&
    result.width === result.height
  ) {
    result.aspectRatio = "1:1";
  }
  return Object.keys(result).length > 0 ? result : null;
}

// ---------------------------------------------------------------------------
// Layout extraction
// ---------------------------------------------------------------------------

function mapSizing(mode) {
  if (mode === "FIXED") return "Fixed";
  if (mode === "HUG" || mode === "AUTO") return "Hug";
  if (mode === "FILL" || mode === "FILL_PARENT") return "Fill";
  return mode || "Fixed";
}

function mapLayoutAlign(val) {
  if (val === "MIN") return "Top" ;
  if (val === "MAX") return "Bottom";
  if (val === "CENTER") return "Center";
  if (val === "SPACE_BETWEEN") return "Space between";
  if (val === "BASELINE") return "Baseline";
  return val || "Min";
}

function mapDirection(mode) {
  if (mode === "HORIZONTAL") return "Horizontal";
  if (mode === "VERTICAL") return "Vertical";
  return "None";
}

function formatAlignment(direction, primary, counter) {
  const pLabel = mapLayoutAlign(primary);
  const cLabel = mapLayoutAlign(counter);
  if (direction === "VERTICAL") {
    return `${pLabel} ${cLabel.toLowerCase()}`;
  }
  return `${cLabel} ${pLabel.toLowerCase()}`;
}

function extractLayoutNode(node, idOverride) {
  const hasLayout = node.layoutMode && node.layoutMode !== "NONE";
  if (!hasLayout) return null;

  const direction = node.layoutMode;
  const primary = node.primaryAxisAlignItems || "MIN";
  const counter = node.counterAxisAlignItems || "MIN";
  const hSizing = mapSizing(
    direction === "HORIZONTAL"
      ? node.primaryAxisSizingMode
      : node.counterAxisSizingMode,
  );
  const vSizing = mapSizing(
    direction === "VERTICAL"
      ? node.primaryAxisSizingMode
      : node.counterAxisSizingMode,
  );

  const layout = {
    node: idOverride || toSnakeId(node.name),
    direction: mapDirection(direction),
    alignment: formatAlignment(direction, primary, counter),
    hSizing,
    vSizing,
    itemSpacing: node.itemSpacing ?? 0,
  };

  const pT = node.paddingTop ?? 0;
  const pR = node.paddingRight ?? 0;
  const pB = node.paddingBottom ?? 0;
  const pL = node.paddingLeft ?? 0;
  if (pT || pR || pB || pL) {
    layout.padding = { top: pT, right: pR, bottom: pB, left: pL };
  }

  return layout;
}

function buildLayoutTree(node, idOverride) {
  const rows = [];
  const self = extractLayoutNode(node, idOverride);
  if (!self) return rows;
  rows.push(self);

  const children = Array.isArray(node.children) ? node.children : [];
  for (const child of children) {
    if (child.visible === false) continue;
    const childLayout = extractLayoutNode(child);
    if (childLayout) {
      rows.push(childLayout);
      // Recurse one level deeper for nested auto-layout
      const grandChildren = Array.isArray(child.children) ? child.children : [];
      for (const gc of grandChildren) {
        if (gc.visible === false) continue;
        const gcLayout = extractLayoutNode(gc);
        if (gcLayout) rows.push(gcLayout);
      }
    } else {
      // Non-auto-layout child — still record its sizing if inside AL parent
      const childBox = child.absoluteBoundingBox || child.size;
      if (childBox) {
        rows.push({
          node: toSnakeId(child.name),
          direction: "—",
          alignment: "—",
          hSizing: child.layoutGrow === 1 ? "Fill" : "Fixed",
          vSizing: child.layoutAlign === "STRETCH" ? "Fill" : "Fixed",
          itemSpacing: "—",
        });
      }
    }
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Anatomy extraction
// ---------------------------------------------------------------------------

function toSnakeId(rawName) {
  return String(rawName || "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .toLowerCase();
}

function extractAnatomyPart(node, index) {
  const id = toSnakeId(node.name);
  const part = {
    index: index + 1,
    id,
    name: String(node.name || "").trim(),
    type: node.type,
  };

  const dims = extractDimensions(node);
  if (dims) part.dimensions = dims;

  const fill = extractFill(node);
  if (fill) part.fill = fill;

  const stroke = extractStroke(node);
  if (stroke) part.stroke = stroke;

  const textStyle = extractTextStyle(node);
  if (textStyle) part.textStyle = textStyle;

  if (node.type === "TEXT") {
    const textColor = extractFill(node);
    if (textColor) part.textColor = textColor;
    if (node.style?.textAlignHorizontal) {
      part.textAlign = node.style.textAlignHorizontal;
    }
  }

  if (node.type === "INSTANCE" && node.componentId) {
    part.instanceOf = node.name;
  }

  const effects = extractEffects(node);
  if (effects.length > 0) part.effects = effects;

  return part;
}

function extractAnatomy(variantNode) {
  const children = Array.isArray(variantNode.children)
    ? variantNode.children
    : [];
  const parts = [];
  let idx = 0;

  function walkChildren(nodes, depth) {
    for (const child of nodes) {
      if (child.visible === false) continue;
      parts.push(extractAnatomyPart(child, idx));
      idx += 1;
      // Recurse into frames/groups to find nested anatomy
      if (
        depth < 2 &&
        Array.isArray(child.children) &&
        child.children.length > 0 &&
        child.type !== "INSTANCE"
      ) {
        walkChildren(child.children, depth + 1);
      }
    }
  }

  walkChildren(children, 0);
  return parts;
}

// ---------------------------------------------------------------------------
// Properties extraction (from componentPropertyDefinitions)
// ---------------------------------------------------------------------------

function extractProperties(componentSetNode) {
  const defs = componentSetNode.componentPropertyDefinitions;
  if (!defs || typeof defs !== "object") return [];

  const properties = [];
  for (const [name, def] of Object.entries(defs)) {
    const typeStr = String(def.type || "").toLowerCase();
    const prop = {
      name,
      type: typeStr,
      default: def.defaultValue,
      required: typeStr === "variant",
      description: "",
    };
    if (def.type === "VARIANT" && Array.isArray(def.variantOptions)) {
      prop.values = def.variantOptions;
    }
    if (def.preferredValues) {
      prop.preferredValues = def.preferredValues;
    }
    properties.push(prop);
  }

  // Sort: enum > text > boolean > instance_swap
  const typeOrder = { variant: 0, text: 1, boolean: 2, instance_swap: 3 };
  properties.sort(
    (a, b) => (typeOrder[a.type] ?? 99) - (typeOrder[b.type] ?? 99),
  );

  return properties;
}

// ---------------------------------------------------------------------------
// Per-variant visual diffs
// ---------------------------------------------------------------------------

function collectVisualFingerprint(node) {
  const fp = {};
  fp.nodeType = node.type;
  const fill = extractFill(node);
  if (fill) fp.fill = fill;
  const stroke = extractStroke(node);
  if (stroke) fp.stroke = stroke;
  const textStyle = extractTextStyle(node);
  if (textStyle) fp.textStyle = textStyle;
  const effects = extractEffects(node);
  if (effects.length > 0) fp.effects = effects;
  if (node.type === "TEXT" && node.style?.textCase) {
    fp.textCase = node.style.textCase;
  }
  return fp;
}

function collectNodeFingerprints(variantNode) {
  const fingerprints = new Map();
  const seenIds = new Map(); // track duplicates

  function walk(node) {
    if (!node || node.visible === false) return;
    let id = toSnakeId(node.name);
    // Deduplicate: append _2, _3, etc. if the same name appears multiple times
    const count = (seenIds.get(id) || 0) + 1;
    seenIds.set(id, count);
    if (count > 1) id = `${id}_${count}`;
    fingerprints.set(id, collectVisualFingerprint(node));
    if (Array.isArray(node.children)) {
      for (const child of node.children) walk(child);
    }
  }

  // Walk children (variant node itself is the root)
  if (Array.isArray(variantNode.children)) {
    for (const child of variantNode.children) walk(child);
  }
  return fingerprints;
}

function extractVariantDiffs(componentSetNode) {
  const variants = Array.isArray(componentSetNode.children)
    ? componentSetNode.children.filter(
        (c) => c.type === "COMPONENT" && c.visible !== false,
      )
    : [];

  if (variants.length === 0) return [];

  const result = [];
  for (const variant of variants) {
    const variantName = String(variant.name || "").trim();
    const nodeFingerprints = collectNodeFingerprints(variant);
    const containerFp = collectVisualFingerprint(variant);
    nodeFingerprints.set("container", containerFp);

    result.push({
      name: variantName,
      properties: parseVariantName(variantName),
      fingerprints: nodeFingerprints,
    });
  }

  return result;
}

function parseVariantName(rawName) {
  const pairs = {};
  const parts = String(rawName || "").split(",");
  for (const part of parts) {
    const eqIndex = part.indexOf("=");
    if (eqIndex < 0) continue;
    const key = part.slice(0, eqIndex).trim();
    const val = part.slice(eqIndex + 1).trim();
    if (key) pairs[key] = val;
  }
  return pairs;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract a complete component spec from a Figma REST API node document.
 *
 * @param {any} nodeDocument - The `document` field from Figma's GET /v1/files/:key/nodes response.
 * @returns {{ name: string, type: string, anatomy: SpecAnatomyItem[], properties: SpecProperty[], variants: any[], layout: any[] }} Structured spec data.
 */
export function extractComponentSpec(nodeDocument) {
  if (!nodeDocument || typeof nodeDocument !== "object") {
    return { name: "", type: "UNKNOWN", anatomy: [], properties: [], variants: [], layout: [] };
  }

  const isComponentSet = nodeDocument.type === "COMPONENT_SET";
  const firstVariant = isComponentSet
    ? (Array.isArray(nodeDocument.children)
        ? nodeDocument.children.find(
            (c) => c.type === "COMPONENT" && c.visible !== false,
          )
        : null) ?? nodeDocument
    : nodeDocument;

  const anatomy = extractAnatomy(firstVariant);
  const properties = extractProperties(nodeDocument);
  const variantDiffs = extractVariantDiffs(nodeDocument);
  const layout = buildLayoutTree(firstVariant, "container");

  return {
    name: String(nodeDocument.name || "").trim(),
    type: nodeDocument.type,
    anatomy,
    properties,
    variants: variantDiffs,
    layout,
  };
}

// ---------------------------------------------------------------------------
// Markdown rendering helpers
// ---------------------------------------------------------------------------

export function renderAnatomyMarkdown(anatomy) {
  if (!anatomy || !Array.isArray(anatomy) || anatomy.length === 0) {
    return "1. **Container**: TBD\n";
  }
  const lines = [];
  for (let i = 0; i < anatomy.length; i++) {
    const part = anatomy[i];
    const index = part.index ?? (i + 1);
    const name = part.name || part.id || "Unnamed";

    let attrs = [];
    if (part.dimensions) {
      const d = part.dimensions;
      if (d.width) attrs.push(`Width ${d.width}`);
      if (d.height) attrs.push(`Height ${d.height}`);
      if (d.borderRadius) attrs.push(`Border radius ${d.borderRadius}`);
      if (d.borderWeight) attrs.push(`Border weight ${d.borderWeight}`);
      if (d.aspectRatio) attrs.push(`Aspect ratio ${d.aspectRatio}`);
    }
    if (part.textColor) attrs.push(`Text color \`${part.textColor}\``);
    if (part.textAlign) attrs.push(`Text align ${part.textAlign}`);
    if (part.textStyle) attrs.push(`Text style ${part.textStyle}`);
    if (part.fill && part.type !== "TEXT") attrs.push(`Fill \`${part.fill}\``);
    if (part.stroke) attrs.push(`Stroke \`${part.stroke}\``);
    if (part.instanceOf) attrs.push(`Instance of ${part.instanceOf}`);
    if (part.effects) attrs.push(part.effects.join("; "));

    const attrStr = attrs.length > 0 ? ` — ${attrs.join(", ")}` : "";
    lines.push(`${index}. **${name}**${attrStr}`);
  }
  return lines.join("\n") + "\n";
}

function mapPropertyTypeLabel(rawType) {
  const normalized = String(rawType || "").trim().toLowerCase();
  if (normalized === "variant") return "VARIANT";
  if (normalized === "text") return "TEXT";
  if (normalized === "boolean") return "BOOLEAN";
  if (normalized === "instance_swap") return "INSTANCE_SWAP";
  return normalized ? normalized.toUpperCase() : "UNKNOWN";
}

function mapPropertyDescription(rawType) {
  const normalized = String(rawType || "").trim().toLowerCase();
  if (normalized === "variant") return "Variant selector.";
  if (normalized === "text") return "Text content value.";
  if (normalized === "boolean") return "Boolean toggle.";
  if (normalized === "instance_swap") return "Instance swap reference.";
  return "Component property.";
}

export function renderPropertiesTable(properties) {
  if (!properties || properties.length === 0) {
    return "| TBD | TBD | TBD | TBD | TBD | TBD |\n";
  }
  const rows = [];
  for (const prop of properties) {
    const type = mapPropertyTypeLabel(prop.type);
    const isRequired = String(prop.type || "").trim().toLowerCase() === "variant";
    // Clean narrative_notes from line breaks so it doesn't break table markdown if present
    const notes = prop.narrative_notes ? prop.narrative_notes.replace(/\n/g, " ") : "";
    rows.push(
      `| ${prop.name} | ${type} | ${String(prop.default ?? "—")} | ${isRequired ? "true" : "false"} | ${mapPropertyDescription(prop.type)} | ${notes} |`,
    );
  }
  return rows.join("\n") + "\n";
}

export function renderVariantSpecs(variants) {
  if (!variants || variants.length === 0) return "";
  const lines = [];

  for (const variant of variants) {
    const propStr = Object.entries(variant.properties)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
    lines.push(`\n#### ${propStr || variant.name}\n`);

    // Collect attribute changes for each node in this variant
    for (const [nodeId, fp] of variant.fingerprints) {
      const attrs = [];
      const isText = fp.nodeType === "TEXT";
      if (fp.fill) attrs.push(`${isText ? "Text color" : "Background"} \`${fp.fill}\``);
      if (fp.stroke) attrs.push(`Stroke \`${fp.stroke}\``);
      if (fp.textStyle) attrs.push(`Text style ${fp.textStyle}`);
      if (fp.textCase && fp.textCase !== "ORIGINAL") attrs.push(`Text case ${fp.textCase}`);
      if (fp.effects && fp.effects.length > 0) attrs.push(fp.effects.join("; "));
      if (attrs.length > 0) {
        lines.push(`- **${nodeId}**: ${attrs.join(", ")}`);
      }
    }
  }

  return lines.join("\n") + "\n";
}

export function renderLayoutTable(layout) {
  if (!layout || layout.length === 0) {
    return "| TBD | TBD | TBD | TBD | TBD | TBD | TBD |\n";
  }
  const rows = [];
  for (const row of layout) {
    const pad = row.padding
      ? `${row.padding.top}/${row.padding.right}/${row.padding.bottom}/${row.padding.left}`
      : "—";
    rows.push(
      `| ${row.node} | ${row.direction} | ${row.alignment} | ${row.hSizing} | ${row.vSizing} | ${row.itemSpacing} | ${pad} |`,
    );
  }
  return rows.join("\n") + "\n";
}

export function renderVariantRows(variants) {
  if (!variants || variants.length === 0) {
    return "| `N/A` | `TBD` | `TBD` | No variant axis detected. |\n";
  }

  return variants
    .map((variant) => {
      const propStr = Object.entries(variant.properties || {})
        .map(([key, value]) => `${key}=${value}`)
        .join(", ");
      const label = propStr || variant.name || "Variant";
      return `| \`${label}\` | \`TBD\` | \`TBD\` | Extracted from Figma variant metadata. |`;
    })
    .join("\n");
}

function renderStatesMarkdown(properties) {
  const variantProperties = Array.isArray(properties)
    ? properties.filter(
        (property) => String(property?.type || "").trim().toLowerCase() === "variant",
      )
    : [];

  if (variantProperties.length === 0) {
    return "- Default: `TBD`.\n- Other states: `TBD`.\n";
  }

  const stateLines = [];
  for (const property of variantProperties) {
    const values = Array.isArray(property.values) ? property.values : [];
    if (values.length === 0) continue;
    for (const value of values) {
      stateLines.push(`- ${String(property.name || "State")}=${value}.`);
    }
  }

  return stateLines.length > 0
    ? `${stateLines.join("\n")}\n`
    : "- Default: `TBD`.\n- Other states: `TBD`.\n";
}

/**
 * @param {Record<string, any>} spec
 * @returns {{ anatomy: string, componentApi: string, visualSpecifications: string, variantsTableRows: string, statesMarkdown: string }}
 */
export function buildEnrichedMarkdownSections(spec) {
  const anatomy = renderAnatomyMarkdown(spec?.anatomy);
  const componentApi = `### Properties

| Name | Type | Default | Required | Description | Narrative Notes |
| --- | --- | --- | --- | --- | --- |
${renderPropertiesTable(spec?.properties)}`;
  const variantAttributes = renderVariantSpecs(spec?.variants)
    ? renderVariantSpecs(spec?.variants).trimEnd()
    : "- `TBD`";
  const visualSpecifications = `### Per-variant attributes

${variantAttributes}

### Layout and spacing

Auto-layout tree describing direction, alignment, resizing, spacing, and padding for each node.

| Node | Direction | Alignment | H Sizing | V Sizing | Item Spacing | Padding (T/R/B/L) |
| --- | --- | --- | --- | --- | --- | --- |
${renderLayoutTable(spec?.layout)}`;

  return {
    anatomy,
    componentApi,
    visualSpecifications,
    variantsTableRows: renderVariantRows(spec?.variants),
    statesMarkdown: renderStatesMarkdown(spec?.properties),
  };
}

/**
 * Render a full enriched markdown seed from extracted spec data.
 *
 * @param {object} opts
 * @param {string} [opts.slug] - Component slug.
 * @param {string} [opts.displayName] - Display name of the component.
 * @param {string} [opts.nodeUrl] - Figma URL to the component.
 * @param {string} [opts.nodeId] - Figma node ID.
 * @param {Record<string, any>} [opts.spec] - Extracted spec from extractComponentSpec().
 * @returns {string} Markdown content.
 */
export function renderEnrichedMarkdownSeed({
  slug,
  displayName,
  nodeUrl,
  nodeId,
  spec,
}) {
  const safeName = displayName || spec?.name || "Component";
  const propsForOverview = (spec?.properties || [])
    .filter((p) => p.type === "variant")
    .map((p) => `${p.name} (${(p.values || []).join(", ")})`)
    .join("; ");
  const sections = buildEnrichedMarkdownSections(spec);
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

## Gaps / TBD

- [ ] [CONTENT_UNKNOWN] Complete usage, accessibility, and token mapping details with product evidence.
`;
}
