/**
 * Capture Targets
 *
 * Utilities for building slug lookups and resolving target slugs.
 */

import { componentNameToSnakeCase } from '../utils/component-name.js';

/**
 * Regex to extract component_set_node_id from YAML spec files.
 * Matches format: component_set_node_id: "123:456" or component_set_node_id: 123:456
 */
const COMPONENT_SET_NODE_ID_REGEX =
  /^\s*component_set_node_id:\s*["']?([0-9]+:[0-9]+)["']?\s*$/m;

/**
 * Normalize name to slug.
 *
 * @param rawName - Raw component name.
 * @returns Normalized slug.
 */
export function normalizeNameToSlug(rawName: string): string {
  const normalized = componentNameToSnakeCase(String(rawName || '').trim());
  return normalized || '';
}

/**
 * Build slug lookup from component registry.
 *
 * @param componentRows - Component registry rows.
 * @returns Map of node ID to slug.
 */
export function buildSlugLookupFromRegistry(
  componentRows: Array<{ slug?: string; figma?: { component_set_node_id?: string } } | null>,
): Map<string, string> {
  const byNodeId = new Map<string, string>();

  if (!Array.isArray(componentRows)) {
    return byNodeId;
  }

  for (const row of componentRows) {
    const slug = String(row?.slug || '').trim();
    const nodeId = String(row?.figma?.component_set_node_id || '').trim();

    if (!slug || !nodeId) {
      continue;
    }

    if (!byNodeId.has(nodeId)) {
      byNodeId.set(nodeId, slug);
    }
  }

  return byNodeId;
}

/**
 * Build slug lookup from spec file contents.
 *
 * @param specFiles - Spec files with slug and content.
 * @returns Map of node ID to slug.
 */
export function buildSlugLookupFromSpecContents(
  specFiles: Array<{ slug?: string; content: string } | null>,
): Map<string, string> {
  const byNodeId = new Map<string, string>();

  if (!Array.isArray(specFiles)) {
    return byNodeId;
  }

  for (const file of specFiles) {
    const raw = String(file?.content || '');
    const slug = String(file?.slug || '').trim();

    const match = raw.match(COMPONENT_SET_NODE_ID_REGEX);

    if (!match || !match[1]) {
      continue;
    }

    const nodeId = String(match[1]).trim();

    if (!byNodeId.has(nodeId)) {
      byNodeId.set(nodeId, slug || normalizeNameToSlug(file?.slug || ''));
    }
  }

  return byNodeId;
}

/**
 * Resolve inferred slug for a component.
 *
 * @param params - Slug resolution parameters.
 * @returns Inferred slug.
 */
export function resolveInferredSlug(params: {
  applySlugOverride: boolean;
  componentSlugOverride: string | null;
  slugByNodeFromRegistry: Map<string, string>;
  slugByNodeFromSpecs: Map<string, string>;
  nodeId: string;
  candidateName: string;
}): string {
  const {
    applySlugOverride,
    componentSlugOverride,
    slugByNodeFromRegistry,
    slugByNodeFromSpecs,
    nodeId,
    candidateName,
  } = params;

  return (
    (applySlugOverride ? componentSlugOverride : '') ||
    slugByNodeFromRegistry.get(nodeId) ||
    slugByNodeFromSpecs.get(nodeId) ||
    normalizeNameToSlug(candidateName)
  );
}
