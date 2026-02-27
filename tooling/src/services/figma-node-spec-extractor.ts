/**
 * Figma Node Spec Extractor
 *
 * Extracts structured component spec data from a Figma REST API node tree:
 *   - Anatomy: child parts with dimensions, text styles, instance references
 *   - Properties: from componentPropertyDefinitions
 *   - Per-variant visual diffs: fills, effects, text styles per variant
 *   - Layout: auto-layout tree with direction, alignment, sizing, spacing, padding
 */

// ---------------------------------------------------------------------------
// Helpers: color / style
// ---------------------------------------------------------------------------

/**
 * Convert a 0-1 value to a hex byte.
 */
function toHexByte(value: number): string {
  const clamped = Math.max(0, Math.min(1, Number(value || 0)));
  return Math.round(clamped * 255)
    .toString(16)
    .padStart(2, '0');
}

/**
 * Convert Figma color object to hex string.
 */
function figmaColorToHex(colorValue: Record<string, unknown> | null): string | null {
  if (!colorValue || typeof colorValue !== 'object') return null;
  const r = toHexByte(colorValue.r as number);
  const g = toHexByte(colorValue.g as number);
  const b = toHexByte(colorValue.b as number);
  const a = toHexByte(Number(colorValue.a ?? 1));
  return a === 'ff' ? `#${r}${g}${b}`.toUpperCase() : `#${r}${g}${b}${a}`.toUpperCase();
}

/**
 * Extract fill color from a node.
 */
function extractFill(node: Record<string, unknown>): string | null {
  const fills = Array.isArray(node.fills) ? node.fills : [];
  const solidFill = fills.find(
    (f) => f.type === 'SOLID' && f.visible !== false
  );
  if (!solidFill) return null;
  return figmaColorToHex(solidFill.color as Record<string, unknown>);
}

/**
 * Extract stroke color from a node.
 */
function extractStroke(node: Record<string, unknown>): string | null {
  const strokes = Array.isArray(node.strokes) ? node.strokes : [];
  const solidStroke = strokes.find(
    (s) => s.type === 'SOLID' && s.visible !== false
  );
  if (!solidStroke) return null;
  return figmaColorToHex(solidStroke.color as Record<string, unknown>);
}

/**
 * Extract text style from a TEXT node.
 */
function extractTextStyle(node: Record<string, unknown>): string | null {
  if (node.type !== 'TEXT') return null;
  const style = node.style as Record<string, unknown> || {};
  const parts: string[] = [];
  if (style.fontFamily) parts.push(style.fontFamily as string);
  if (style.fontWeight && style.fontWeight !== 400) {
    parts.push((style.fontWeight as number) >= 700 ? 'Bold' : `w${style.fontWeight}`);
  }
  if (style.fontSize) parts.push(`${style.fontSize}`);
  if (style.textCase === 'UPPER') parts.push('Uppercase');
  if (style.textCase === 'LOWER') parts.push('Lowercase');
  return parts.length > 0 ? parts.join('/') : null;
}

/**
 * Extract effects from a node.
 */
function extractEffects(node: Record<string, unknown>): string[] {
  const effects = Array.isArray(node.effects) ? node.effects : [];
  return effects
    .filter((e) => e.visible !== false)
    .map((effect: Record<string, unknown>) => {
      if (effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW') {
        const ox = (effect.offset as Record<string, unknown>)?.x ?? 0;
        const oy = (effect.offset as Record<string, unknown>)?.y ?? 0;
        const radius = effect.radius ?? 0;
        const spread = effect.spread ?? 0;
        const color = figmaColorToHex(effect.color as Record<string, unknown>) || '#000000';
        const kind = effect.type === 'DROP_SHADOW' ? 'Drop shadow' : 'Inner shadow';
        return `${kind} ${ox}px ${oy}px ${radius}px ${spread}px ${color}`;
      }
      if (effect.type === 'LAYER_BLUR') {
        return `Blur ${effect.radius ?? 0}px`;
      }
      return effect.type as string;
    });
}

/**
 * Extract dimensions from a node.
 */
function extractDimensions(node: Record<string, unknown>): Record<string, unknown> | null {
  const result: Record<string, unknown> = {};
  const box = node.absoluteBoundingBox || node.size;
  if (box) {
    if ((box as Record<string, unknown>).width !== undefined) result.width = toNumberOr((box as Record<string, unknown>).width, 0);
    if ((box as Record<string, unknown>).height !== undefined) result.height = toNumberOr((box as Record<string, unknown>).height, 0);
  }
  const cornerRadius = toNumberOr(node.cornerRadius, 0);
  if (cornerRadius > 0) {
    result.borderRadius = cornerRadius;
  }
  const strokeWeight = toNumberOr(node.strokeWeight, 0);
  if (strokeWeight > 0) {
    result.borderWeight = strokeWeight;
  }
  if (
    result.width &&
    result.height &&
    result.width === result.height
  ) {
    result.aspectRatio = '1:1';
  }
  return Object.keys(result).length > 0 ? result : null;
}

// ---------------------------------------------------------------------------
// Layout extraction
// ---------------------------------------------------------------------------

/**
 * Map Figma sizing mode to spec value.
 */
function mapSizing(mode: string): string {
  if (mode === 'FIXED') return 'Fixed';
  if (mode === 'HUG' || mode === 'AUTO') return 'Hug';
  if (mode === 'FILL' || mode === 'FILL_PARENT') return 'Fill';
  return mode || 'Fixed';
}

/**
 * Map Figma alignment value to spec value.
 */
function mapLayoutAlign(val: string): string {
  if (val === 'MIN') return 'Top';
  if (val === 'MAX') return 'Bottom';
  if (val === 'CENTER') return 'Center';
  if (val === 'SPACE_BETWEEN') return 'Space between';
  if (val === 'BASELINE') return 'Baseline';
  return val || 'Min';
}

/**
 * Map Figma layout mode to direction.
 */
function mapDirection(mode: string): string {
  if (mode === 'HORIZONTAL') return 'Horizontal';
  if (mode === 'VERTICAL') return 'Vertical';
  return 'None';
}

/**
 * Format alignment for spec output.
 */
function formatAlignment(direction: string, primary: string, counter: string): string {
  const pLabel = mapLayoutAlign(primary);
  const cLabel = mapLayoutAlign(counter);
  if (direction === 'VERTICAL') {
    return `${pLabel} ${cLabel.toLowerCase()}`;
  }
  return `${cLabel} ${pLabel.toLowerCase()}`;
}

export interface LayoutNode {
  node: string;
  direction: string;
  alignment: string;
  hSizing: string;
  vSizing: string;
  itemSpacing: number;
  padding?: { top: number; right: number; bottom: number; left: number };
}

/**
 * Extract layout node from a Figma node.
 */
function extractLayoutNode(node: Record<string, unknown>, idOverride: string | null): LayoutNode | null {
  const hasLayout = node.layoutMode && node.layoutMode !== 'NONE';
  if (!hasLayout) return null;

  const direction = node.layoutMode as string;
  const primary = node.primaryAxisAlignItems as string || 'MIN';
  const counter = node.counterAxisAlignItems as string || 'MIN';
  const hSizing = mapSizing(
    direction === 'HORIZONTAL'
      ? (node.primaryAxisSizingMode as string)
      : (node.counterAxisSizingMode as string)
  );
  const vSizing = mapSizing(
    direction === 'VERTICAL'
      ? (node.primaryAxisSizingMode as string)
      : (node.counterAxisSizingMode as string)
  );

  const layout: LayoutNode = {
    node: idOverride || toSnakeId(node.name as string),
    direction: mapDirection(direction),
    alignment: formatAlignment(direction, primary, counter),
    hSizing,
    vSizing,
    itemSpacing: toNumberOr(node.itemSpacing, 0),
  };

  const pT = toNumberOr(node.paddingTop, 0);
  const pR = toNumberOr(node.paddingRight, 0);
  const pB = toNumberOr(node.paddingBottom, 0);
  const pL = toNumberOr(node.paddingLeft, 0);
  if (pT || pR || pB || pL) {
    layout.padding = { top: pT, right: pR, bottom: pB, left: pL };
  }

  return layout;
}

/**
 * Build layout tree from a node.
 */
function buildLayoutTree(node: Record<string, unknown>, idOverride: string | null): LayoutNode[] {
  const rows: LayoutNode[] = [];
  const self = extractLayoutNode(node, idOverride);
  if (!self) return rows;
  rows.push(self);

  const children = Array.isArray(node.children) ? node.children : [];
  for (const child of children) {
    if (child.visible === false) continue;
    const childLayout = buildLayoutTree(child as Record<string, unknown>, null);
    rows.push(...childLayout);
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Anatomy extraction
// ---------------------------------------------------------------------------

export interface SpecAnatomyItem {
  id: string;
  name: string;
  type?: string;
  dimensions?: Record<string, unknown>;
  fill?: string;
  stroke?: string;
  textStyle?: string;
  effects?: string[];
  instanceOf?: string;
  // Note: No children field - anatomy is returned as flat list to avoid duplication
}

/**
 * Extract anatomy item from a node.
 */
function extractAnatomyItem(node: Record<string, unknown>, idOverride?: string): SpecAnatomyItem | null {
  const name = String(node.name || '').trim();
  if (!name) return null;

  const item: SpecAnatomyItem = {
    id: idOverride || toSnakeId(name),
    name,
  };

  const type = node.type as string;
  if (type && type !== 'FRAME') {
    item.type = type;
  }

  const dimensions = extractDimensions(node);
  if (dimensions) {
    item.dimensions = dimensions;
  }

  const fill = extractFill(node);
  if (fill) {
    item.fill = fill;
  }

  const stroke = extractStroke(node);
  if (stroke) {
    item.stroke = stroke;
  }

  const textStyle = extractTextStyle(node);
  if (textStyle) {
    item.textStyle = textStyle;
  }

  const effects = extractEffects(node);
  if (effects.length > 0) {
    item.effects = effects;
  }

  if (type === 'INSTANCE' && node.componentId) {
    item.instanceOf = String(node.componentId).trim();
  }

  return item;
}

/**
 * Extract anatomy from a node tree.
 * Returns a flat list of anatomy items (no nested children to avoid duplication).
 */
function extractAnatomy(rootNode: Record<string, unknown>): SpecAnatomyItem[] {
  const result: SpecAnatomyItem[] = [];

  function visit(node: Record<string, unknown>, depth: number) {
    if (depth > 3) return; // Limit depth
    const item = extractAnatomyItem(node);
    if (item) {
      result.push(item);
    }
    const children = Array.isArray(node.children) ? node.children : [];
    const visibleChildren = children.filter((c) => c.visible !== false);
    for (const child of visibleChildren) {
      visit(child as Record<string, unknown>, depth + 1);
    }
  }

  visit(rootNode, 0);
  return result;
}

// ---------------------------------------------------------------------------
// Properties extraction
// ---------------------------------------------------------------------------

export interface SpecProperty {
  name: string;
  type: string;
  values?: string[];
  default?: string;
  required?: boolean;
  description?: string;
}

/**
 * Extract properties from component property definitions.
 */
function extractProperties(node: Record<string, unknown>): SpecProperty[] {
  const props: SpecProperty[] = [];
  const componentPropertyDefinitions = node.componentPropertyDefinitions as Record<string, unknown> | null;
  if (!componentPropertyDefinitions || typeof componentPropertyDefinitions !== 'object') {
    return props;
  }

  for (const [propName, propDef] of Object.entries(componentPropertyDefinitions)) {
    if (!propDef || typeof propDef !== 'object') continue;
    const def = propDef as Record<string, unknown>;
    const prop: SpecProperty = {
      name: propName,
      type: 'text',
    };

    const propType = def.type as string;
    if (propType === 'VARIANT') {
      prop.type = 'enum';
      const values = def.variantOptions as string[] | null;
      if (Array.isArray(values)) {
        prop.values = values.map(String);
      }
    } else if (propType === 'INSTANCE_SWAP') {
      prop.type = 'instance_swap';
    } else if (propType === 'BOOLEAN') {
      prop.type = 'boolean';
    }

    const defaultValue = def.defaultValue;
    if (defaultValue !== undefined) {
      prop.default = String(defaultValue);
    }

    props.push(prop);
  }

  return props;
}

// ---------------------------------------------------------------------------
// Variant diffs extraction
// ---------------------------------------------------------------------------

export interface VariantDiff {
  name: string;
  properties: Record<string, string>;
  fills?: Record<string, string>;
  effects?: Record<string, string[]>;
  textStyles?: Record<string, string>;
}

/**
 * Extract variant diffs from a component set.
 */
function extractVariantDiffs(node: Record<string, unknown>): VariantDiff[] {
  const diffs: VariantDiff[] = [];
  const children = Array.isArray(node.children) ? node.children : [];

  for (const child of children) {
    if (child.type !== 'COMPONENT' || child.visible === false) continue;
    const variant = child as Record<string, unknown>;
    const diff: VariantDiff = {
      name: String(variant.name || '').trim(),
      properties: {},
    };

    // Extract variant properties
    const componentProperties = variant.componentProperties as Record<string, unknown> | null;
    if (componentProperties && typeof componentProperties === 'object') {
      for (const [propName, propValue] of Object.entries(componentProperties)) {
        if (propValue && typeof propValue === 'object') {
          const value = (propValue as Record<string, unknown>).value;
          if (value !== undefined) {
            diff.properties[propName] = String(value);
          }
        }
      }
    }

    // Extract visual diffs
    const fill = extractFill(variant);
    if (fill) {
      diff.fills = { default: fill };
    }

    const effects = extractEffects(variant);
    if (effects.length > 0) {
      diff.effects = { default: effects };
    }

    const textStyle = extractTextStyle(variant);
    if (textStyle) {
      diff.textStyles = { default: textStyle };
    }

    diffs.push(diff);
  }

  return diffs;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Safely coerce a value to a number, returning fallback if invalid.
 */
function toNumberOr(value: unknown, fallback: number): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

/**
 * Convert a name to snake_case id.
 */
function toSnakeId(rawName: string): string {
  return String(rawName || '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .toLowerCase();
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export interface ExtractedComponentSpec {
  name: string;
  type: string;
  anatomy: SpecAnatomyItem[];
  properties: SpecProperty[];
  variants: VariantDiff[];
  layout: LayoutNode[];
}

/**
 * Extract a complete component spec from a Figma REST API node document.
 */
export function extractComponentSpec(nodeDocument: Record<string, unknown>): ExtractedComponentSpec {
  return {
    name: String(nodeDocument.name || '').trim(),
    type: String(nodeDocument.type || '').trim(),
    anatomy: extractAnatomy(nodeDocument),
    properties: extractProperties(nodeDocument),
    variants: extractVariantDiffs(nodeDocument),
    layout: buildLayoutTree(nodeDocument, 'container'),
  };
}
