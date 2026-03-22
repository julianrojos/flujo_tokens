/**
 * Spec Renderer Utilities
 *
 * Render spec data structures to Markdown.
 * Migrated from tooling/scripts/lib/figma-node-spec-extractor.mjs
 */

export interface SpecAnatomyItem {
  index?: number;
  id: string;
  name: string;
  type?: string;
  dimensions?: {
    width?: number;
    height?: number;
    borderRadius?: number;
    borderWeight?: number;
    aspectRatio?: string;
  };
  textColor?: string;
  textAlign?: string;
  textStyle?: string;
  fill?: string;
  fill_alias_chain?: string[];
  fill_resolved?: string;
  stroke?: string;
  instanceOf?: string;
  effects?: string[];
}

export interface SpecProperty {
  name: string;
  type?: string;
  default?: string;
  values?: string[];
  narrative_notes?: string;
  // Optional fields for manual spec data (preserved if provided)
  required?: boolean;
  description?: string;
}

/**
 * Spec Variant with fingerprints (enriched from Figma).
 * Used for rendering variant diffs from Figma node data.
 */
export interface SpecVariantFingerprint {
  name: string;
  properties: Record<string, string>;
  fingerprints: Map<string, {
    nodeType?: string;
    fill?: string;
    stroke?: string;
    textStyle?: string;
    textCase?: string;
    effects?: string[];
  }>;
}

export interface SpecLayoutRow {
  node: string;
  direction: string;
  alignment: string;
  hSizing: string;
  vSizing: string;
  itemSpacing: string | number;
  padding?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
}

/**
 * Render anatomy items to Markdown list.
 */
export function renderAnatomyMarkdown(anatomy: SpecAnatomyItem[] | undefined | null): string {
  if (!anatomy || !Array.isArray(anatomy) || anatomy.length === 0) {
    return '1. **Container**: TBD\n';
  }
  const lines: string[] = [];
  for (let i = 0; i < anatomy.length; i++) {
    const part = anatomy[i];
    const index = part.index ?? (i + 1);
    const name = part.name || part.id || 'Unnamed';

    const attrs: string[] = [];
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
    if (part.fill && part.type !== 'TEXT') attrs.push(`Fill \`${part.fill}\``);
    if (part.stroke) attrs.push(`Stroke \`${part.stroke}\``);
    if (part.instanceOf) attrs.push(`Instance of ${part.instanceOf}`);
    if (part.effects) attrs.push(part.effects.join('; '));

    const attrStr = attrs.length > 0 ? ` — ${attrs.join(', ')}` : '';
    lines.push(`${index}. **${name}**${attrStr}`);
  }
  return lines.join('\n') + '\n';
}

/**
 * Map raw property type to display label.
 */
function mapPropertyTypeLabel(rawType: string | undefined): string {
  const normalized = String(rawType || '').trim().toLowerCase();
  if (normalized === 'variant') return 'VARIANT';
  if (normalized === 'text') return 'TEXT';
  if (normalized === 'boolean') return 'BOOLEAN';
  if (normalized === 'instance_swap') return 'INSTANCE_SWAP';
  return normalized ? normalized.toUpperCase() : 'UNKNOWN';
}

/**
 * Map property type to description.
 * Uses explicit description if provided, otherwise falls back to type-based heuristic.
 */
function mapPropertyDescription(rawType: string | undefined, explicitDescription?: string): string {
  if (explicitDescription) return explicitDescription;
  const normalized = String(rawType || '').trim().toLowerCase();
  if (normalized === 'variant') return 'Variant selector.';
  if (normalized === 'text') return 'Text content value.';
  if (normalized === 'boolean') return 'Boolean toggle.';
  if (normalized === 'instance_swap') return 'Instance swap reference.';
  return 'Component property.';
}

/**
 * Sanitize text for safe inclusion in Markdown table cells.
 * Escapes pipe characters and replaces newlines to prevent table structure breakage.
 */
function sanitizeTableCell(text: string | undefined | null): string {
  if (!text) return '';
  return String(text)
    .replace(/\|/g, '\\|')  // Escape pipe characters
    .replace(/\n/g, ' ')    // Replace newlines with spaces
    .replace(/\r/g, '');    // Remove carriage returns
}

/**
 * Render properties table rows.
 */
export function renderPropertiesTable(properties: SpecProperty[] | undefined | null): string {
  if (!properties || properties.length === 0) {
    return '| TBD | TBD | TBD | TBD | TBD | TBD |\n';
  }
  const rows: string[] = [];
  for (const prop of properties) {
    const type = mapPropertyTypeLabel(prop.type);
    // Use explicit required if provided, otherwise fall back to type-based heuristic
    const isRequired = prop.required ?? (String(prop.type || '').trim().toLowerCase() === 'variant');
    // Use explicit description if provided, otherwise fall back to type-based heuristic
    const description = mapPropertyDescription(prop.type, prop.description);
    const notes = prop.narrative_notes ?? '';
    rows.push(
      `| ${sanitizeTableCell(prop.name)} | ${type} | ${sanitizeTableCell(String(prop.default ?? '—'))} | ${isRequired ? 'true' : 'false'} | ${sanitizeTableCell(description)} | ${sanitizeTableCell(notes)} |`
    );
  }
  return rows.join('\n') + '\n';
}

/**
 * Render variant diffs section.
 * Supports both Map and plain object for fingerprints (handles JSON serialization edge case).
 */
export function renderVariantSpecs(
  variants: Array<{
    name: string;
    properties?: Record<string, string>;
    fingerprints?: Map<string, { nodeType?: string; fill?: string; stroke?: string; textStyle?: string; textCase?: string; effects?: string[] }> | Record<string, unknown>;
  }> | undefined | null
): string {
  if (!variants || variants.length === 0) return '';
  const lines: string[] = [];

  for (const variant of variants) {
    const propStr = Object.entries(variant.properties || {})
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    lines.push(`\n#### ${propStr || variant.name}\n`);

    // Handle both Map and plain object for fingerprints (JSON serialization edge case)
    let fingerprints: Iterable<[string, { nodeType?: string; fill?: string; stroke?: string; textStyle?: string; textCase?: string; effects?: string[] }]>;
    if (variant.fingerprints instanceof Map) {
      fingerprints = variant.fingerprints;
    } else if (variant.fingerprints && typeof variant.fingerprints === 'object') {
      // Fallback for JSON-serialized fingerprints (converted to plain object)
      fingerprints = Object.entries(variant.fingerprints) as Array<[string, { nodeType?: string; fill?: string; stroke?: string; textStyle?: string; textCase?: string; effects?: string[] }]>;
    } else {
      continue; // Skip if no valid fingerprints
    }

    for (const [nodeId, fp] of fingerprints) {
      const attrs: string[] = [];
      const isText = fp.nodeType === 'TEXT';
      if (fp.fill) attrs.push(`${isText ? 'Text color' : 'Background'} \`${fp.fill}\``);
      if (fp.stroke) attrs.push(`Stroke \`${fp.stroke}\``);
      if (fp.textStyle) attrs.push(`Text style ${fp.textStyle}`);
      if (fp.textCase && fp.textCase !== 'ORIGINAL') attrs.push(`Text case ${fp.textCase}`);
      if (fp.effects && fp.effects.length > 0) attrs.push(fp.effects.join('; '));
      if (attrs.length > 0) {
        lines.push(`- **${nodeId}**: ${attrs.join(', ')}`);
      }
    }
  }

  return lines.join('\n') + '\n';
}

/**
 * Render layout table rows.
 */
export function renderLayoutTable(layout: SpecLayoutRow[] | undefined | null): string {
  if (!layout || layout.length === 0) {
    return '| TBD | TBD | TBD | TBD | TBD | TBD | TBD |\n';
  }
  const rows: string[] = [];
  for (const row of layout) {
    const pad = row.padding
      ? `${row.padding.top}/${row.padding.right}/${row.padding.bottom}/${row.padding.left}`
      : '—';
    rows.push(
      `| ${sanitizeTableCell(row.node)} | ${sanitizeTableCell(row.direction)} | ${sanitizeTableCell(row.alignment)} | ${sanitizeTableCell(row.hSizing)} | ${sanitizeTableCell(row.vSizing)} | ${sanitizeTableCell(String(row.itemSpacing))} | ${sanitizeTableCell(pad)} |`
    );
  }
  return rows.join('\n') + '\n';
}

/**
 * Render variant rows for table.
 * Supports both enriched format (with fingerprints) and manual format (with _manual field).
 */
export function renderVariantRows(
  variants: Array<{
    name: string;
    properties?: Record<string, string>;
    fingerprints?: Map<string, unknown>;
    _manual?: { token?: string; fallback?: string; notes?: string };
  }> | undefined | null
): string {
  if (!variants || variants.length === 0) {
    return '| `N/A` | `TBD` | `TBD` | No variant axis detected. |\n';
  }

  return variants
    .map((variant) => {
      // Prefer manual data if available (from YAML spec)
      if (variant._manual) {
        const token = variant._manual.token || '`TBD`';
        const fallback = variant._manual.fallback || '`TBD`';
        const notes = variant._manual.notes || '';
        const label = variant.name || 'Variant';
        return `| \`${sanitizeTableCell(label)}\` | ${sanitizeTableCell(token)} | ${sanitizeTableCell(fallback)} | ${sanitizeTableCell(notes) || 'Extracted from Figma variant metadata.'} |`;
      }
      
      // Fallback to enriched format (from Figma extraction)
      const propStr = Object.entries(variant.properties || {})
        .map(([key, value]) => `${key}=${value}`)
        .join(', ');
      const label = propStr || variant.name || 'Variant';
      return `| \`${sanitizeTableCell(label)}\` | \`TBD\` | \`TBD\` | Extracted from Figma variant metadata. |`;
    })
    .join('\n');
}
