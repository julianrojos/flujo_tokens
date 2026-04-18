/**
 * Figma Spec Metadata Snapshot
 *
 * Derives stable spec metadata (component hash, node ID, counts) from spec objects.
 */
import * as crypto from 'node:crypto';
import { isPlainObject } from '../utils/is-plain-object.js';
import { normalizeNodeId } from '../utils/figma-node-id.js';
import type { FigmaNode } from '../types/figma.js';

const FIGMA_NODE_ID_RE = /^[A-Za-z0-9]+:[A-Za-z0-9]+$/;

/**
 * Result of deriving stable Figma spec metadata from a spec.
 */
export interface FigmaSpecMetadataSnapshot {
  componentSetNodeId: string;
  componentHash: string;
  propertiesCount: number;
  variantsCount: number;
}

/**
 * Deeply sort object keys for stable hashing.
 */
function stableSortDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stableSortDeep(item));
  }

  if (isPlainObject(value)) {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort((a, b) =>
      a.localeCompare(b, 'en')
    )) {
      sorted[key] = stableSortDeep(value[key]);
    }
    return sorted;
  }

  return value;
}

/**
 * Compute SHA256 hash of input string.
 */
function sha256(input: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(input);
  return hash.digest('hex');
}

/**
 * Normalize string array (trim, filter empty).
 */
function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean);
}

/**
 * Normalize a single property object for snapshot comparison.
 */
interface NormalizedProperty {
  [key: string]: unknown;
  values?: string[];
}

function normalizePropertyForSnapshot(property: Record<string, unknown>): NormalizedProperty {
  const normalized: NormalizedProperty = {};

  for (const [key, rawValue] of Object.entries(property)) {
    if (key === 'values') {
      normalized.values = normalizeStringArray(rawValue);
      continue;
    }

    if (typeof rawValue === 'string') {
      normalized[key] = rawValue.trim();
      continue;
    }

    normalized[key] = stableSortDeep(rawValue);
  }

  return normalized;
}

/**
 * Parse and validate properties array from spec.
 */
function parseProperties(spec: Record<string, unknown>): Record<string, unknown>[] {
  const rawProperties = Array.isArray(spec.properties) ? spec.properties : [];
  return rawProperties.filter((entry): entry is Record<string, unknown> =>
    isPlainObject(entry)
  );
}

/**
 * Compute variants count from properties.
 * Counts enum/variant type properties and multiplies their value counts.
 */
function computeVariantsCount(properties: Record<string, unknown>[]): number {
  const variantAxes = properties
    .map((property) => ({
      type: String(property.type ?? '').trim().toLowerCase(),
      values: normalizeStringArray(property.values),
    }))
    .filter((axis) => axis.type === 'enum' || axis.type === 'variant');

  if (variantAxes.length === 0) return 1;

  let total = 1;
  for (const axis of variantAxes) {
    const axisCount = axis.values.length;
    if (axisCount === 0) return 0;
    total *= axisCount;
  }
  return total;
}

/**
 * Get normalized component set node ID from spec.
 */
function getNormalizedComponentSetNodeId(spec: Record<string, unknown>): string {
  const figma = isPlainObject(spec.figma) ? (spec.figma as Record<string, unknown>) : {};
  const rawNodeId = String(figma.component_set_node_id ?? '').trim();
  if (!rawNodeId) return '';
  const normalizedNodeId = normalizeNodeId(rawNodeId);
  return FIGMA_NODE_ID_RE.test(normalizedNodeId) ? normalizedNodeId : '';
}

/**
 * Derive stable Figma spec metadata from a spec object.
 *
 * @param spec - Parsed component spec object
 * @returns Stable metadata including component hash, node ID, and counts
 */
export function deriveFigmaSpecMetadataSnapshot(
  spec: unknown
): FigmaSpecMetadataSnapshot {
  const safeSpec = isPlainObject(spec) ? (spec as Record<string, unknown>) : {};
  const properties = parseProperties(safeSpec);
  const normalizedProperties = properties.map((property) =>
    normalizePropertyForSnapshot(property)
  );
  const componentSetNodeId = getNormalizedComponentSetNodeId(safeSpec);

  const snapshot = {
    component_set_node_id: componentSetNodeId,
    properties: normalizedProperties,
  };

  const canonicalSnapshot = stableSortDeep(snapshot) as Record<string, unknown>;
  const componentHash = sha256(JSON.stringify(canonicalSnapshot));

  return {
    componentSetNodeId,
    componentHash,
    propertiesCount: properties.length,
    variantsCount: computeVariantsCount(properties),
  };
}
