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
 * Build slug lookup map from component spec contents.
 */
export function buildSlugLookupFromSpecContents(
  specFiles: Array<{ slug: string; content: string }>,
): Map<string, string> {
  const byNodeId = new Map<string, string>();
  
  if (!Array.isArray(specFiles)) return byNodeId;
  
  for (const file of specFiles) {
    const raw = String(file.content || '');
    const slug = String(file.slug || '').trim();
    const match = raw.match(/^\s*component_set_node_id:\s*["']?([0-9]+:[0-9]+)["']?\s*$/m);
    
    if (!match || !match[1]) continue;
    const nodeId = String(match[1]).trim();
    
    if (!byNodeId.has(nodeId)) byNodeId.set(nodeId, slug);
  }
  
  return byNodeId;
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
  slugByNodeFromSpecs: Map<string, string>;
  nodeId: string;
  candidateName?: unknown;
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
    slugByNodeFromRegistry?.get(nodeId) ||
    slugByNodeFromSpecs.get(nodeId) ||
    normalizeNameToSlug(candidateName)
  );
}
