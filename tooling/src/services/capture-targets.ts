/**
 * Capture Targets
 *
 * Utilities for resolving and building capture targets.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { componentNameToSnakeCase } from '../utils/component-name.js';

/**
 * Normalize name to snake_case slug.
 */
export function normalizeNameToSlug(rawName: unknown): string {
  const normalized = componentNameToSnakeCase(String(rawName || '').trim());
  return normalized || '';
}


/**
 * Build slug lookup map from persisted component rows.
 */
export function buildSlugLookupFromRegistry(
  componentRows: unknown[],
): Map<string, string> {
  const byNodeId = new Map<string, string>();

  if (!Array.isArray(componentRows)) return byNodeId;

  for (const row of componentRows) {
    if (!row || typeof row !== 'object') continue;
    const rowObj = row as Record<string, unknown>;
    const slug = String(rowObj.slug || '').trim();
    const nodeId =
      String((rowObj.figma as Record<string, unknown> | undefined)?.component_set_node_id || '').trim();

    if (!slug || !nodeId) continue;
    if (!byNodeId.has(nodeId)) byNodeId.set(nodeId, slug);
  }

  return byNodeId;
}

/**
 * Resolve inferred slug for candidate.
 */
export function resolveInferredSlug(params: {
  applySlugOverride?: boolean;
  componentSlugOverride?: string;
  slugByNodeFromRegistry?: Map<string, string>;
  nodeId: string;
  candidateName?: unknown;
}): string {
  const {
    applySlugOverride,
    componentSlugOverride,
    slugByNodeFromRegistry,
    nodeId,
    candidateName,
  } = params;
  const normalizedNodeSlug = String(nodeId || '')
    .trim()
    .replace(/:/g, '_')
    .replace(/[^a-zA-Z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  return (
    (applySlugOverride ? componentSlugOverride : '') ||
    slugByNodeFromRegistry?.get(nodeId) ||
    normalizeNameToSlug(candidateName) ||
    (normalizedNodeSlug ? `component_${normalizedNodeSlug}` : '')
  );
}
