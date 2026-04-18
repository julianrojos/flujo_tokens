/**
 * Capture Target Builder
 *
 * Builds capture targets from Figma source candidates.
 * Handles spec extraction and exhibit mapping.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { resolveInferredSlug } from './capture-targets.js';
import { resolveDocsPaths } from './capture-path-resolver.js';
import type { ExtractedComponentSpec } from '../types/spec.js';
import type { DocsPaths, CaptureContext } from '../types/capture-path-resolver.js';
import type { CaptureTarget, CaptureTargetKind, SpecExhibit, SpecExhibits } from '../types/capture-targets.js';

// Re-export types for consumers
export type { ExtractedComponentSpec, CaptureTarget, CaptureTargetKind, CaptureContext, SpecExhibit, SpecExhibits };

/**
 * Figma descriptor for source.
 */
export interface FigmaDescriptor {
  fileKey: string;
  sourceUrl?: string;
  figmaUrl?: string;
  fileName?: string;
  fileSlug?: string;
  surface?: string;
  rootNodeId?: string;
  nodeIdFromUrl?: string;
  [key: string]: unknown;
}

/**
 * Source candidate for capture.
 */
export interface SourceCandidate {
  node_id: string;
  name?: string;
  page_name?: string;
  kind?: string;
  type?: string;
  [key: string]: unknown;
}

/**
 * Options for building capture targets.
 */
export interface BuildCaptureTargetsOptions {
  sourceCandidates: SourceCandidate[];
  descriptor: FigmaDescriptor;
  ctx: CaptureContext | Record<string, unknown>;
  docsRootOverride?: string;
  applySlugOverride?: boolean;
  componentSlugOverride?: string;
  slugByNodeFromRegistry?: Map<string, string> | Record<string, string>;
  slugByNodeFromSpecs?: Map<string, string> | Record<string, string>;
  includeSpecExhibits?: boolean;
  figmaToken: string;
  repoRoot: string;
  ensureFilePayload: () => Promise<unknown>;
  fetchFigmaNodes: (options: { fileKey: string; nodeIds: string[]; token: string }) => Promise<{
    nodes?: Record<string, { document?: unknown }>;
  }>;
  fetchFigmaImages: (options: { fileKey: string; nodeIds: string[]; token: string; format?: string; scale?: number }) => Promise<{
    images?: Record<string, string>;
  }>;
  extractComponentSpec: (
    node: unknown,
    options?: {
      resolveTokenTraceByVariableId?: (variableId: string) => {
        path: string | null;
        aliasChain: string[];
        resolved: string | null;
      };
    },
  ) => ExtractedComponentSpec;
  resolveSpecExhibitNodeIds: (options: { figmaFilePayload: unknown; targetNodeId: string }) => {
    specsNodeId?: string;
    anatomyNodeId?: string;
    propertiesNodeId?: string;
    layoutNodeId?: string;
  } | null;
  buildFigmaNodeUrl: (descriptor: FigmaDescriptor | Record<string, unknown>, nodeId: string) => string;
  classifyTargetKind: (kind?: string | null) => CaptureTargetKind;
  stderrWrite?: (data: string) => void;
  specExistsFn: (filePath: string) => boolean;
}

/**
 * Skipped target result.
 */
export interface SkippedTarget {
  slug?: string;
  node_id: string;
  name: string;
  reason: string;
  error?: string;
}

/**
 * Result of building capture targets.
 */
export interface BuildCaptureTargetsResult {
  targets: CaptureTarget[];
  skipped: SkippedTarget[];
}

/**
 * Build error message for node operations.
 */
function buildNodeErrorMessage(prefix: string, nodeId: string, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `[capture] ${prefix} for ${nodeId}: ${detail}\n`;
}

/**
 * Map spec exhibit from images by node ID.
 */
function mapSpecExhibit(sourceNodeId: string | undefined, imagesByNodeId: Record<string, string>): SpecExhibit | null {
  const normalizedNodeId = String(sourceNodeId || '').trim();
  if (!normalizedNodeId) return null;
  const imageUrl = String(imagesByNodeId[normalizedNodeId] || '').trim();
  return {
    nodeId: normalizedNodeId,
    imageUrl: imageUrl || null,
  };
}

function normalizeSlugLookup(
  lookup: Map<string, string> | Record<string, string> | undefined,
): Map<string, string> {
  if (lookup instanceof Map) return lookup;
  const normalized = new Map<string, string>();
  if (!lookup || typeof lookup !== 'object') return normalized;

  for (const [nodeId, slug] of Object.entries(lookup)) {
    const normalizedNodeId = String(nodeId || '').trim();
    const normalizedSlug = String(slug || '').trim();
    if (!normalizedNodeId || !normalizedSlug) continue;
    normalized.set(normalizedNodeId, normalizedSlug);
  }

  return normalized;
}

interface VariableTraceEntry {
  path: string;
  aliasTargetId: string | null;
  rawValue: string | null;
}

function toRawValueString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return null;
}

async function buildVariableTraceMap(inputDir: string): Promise<Map<string, VariableTraceEntry>> {
  const result = new Map<string, VariableTraceEntry>();
  if (!inputDir) return result;

  let entries: Array<{ name: string; isFile: () => boolean }>;
  try {
    entries = await fs.readdir(inputDir, { withFileTypes: true }) as Array<{ name: string; isFile: () => boolean }>;
  } catch {
    return result;
  }

  const jsonFiles = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
    .map((entry) => path.join(inputDir, entry.name));

  const visit = (node: unknown, segments: string[]): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item, segments);
      }
      return;
    }

    const record = node as Record<string, unknown>;
    const variableId = String(record.$id || '').trim();
    if (variableId && segments.length > 0 && !result.has(variableId)) {
      const rawValue = record.$value;
      const aliasTargetId =
        rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)
          ? String((rawValue as Record<string, unknown>).type || '').trim().toUpperCase() === 'VARIABLE_ALIAS'
            ? String((rawValue as Record<string, unknown>).id || '').trim() || null
            : null
          : null;
      result.set(variableId, {
        path: segments.join('.'),
        aliasTargetId,
        rawValue: toRawValueString(rawValue),
      });
    }

    for (const [key, value] of Object.entries(record)) {
      if (key.startsWith('$')) continue;
      visit(value, [...segments, key]);
    }
  };

  for (const filePath of jsonFiles) {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      visit(parsed, []);
    } catch {
      // Ignore malformed token files during capture.
    }
  }

  return result;
}

function resolveTokenTrace(
  variableTraceById: Map<string, VariableTraceEntry>,
  variableIdRaw: string,
): { path: string | null; aliasChain: string[]; resolved: string | null } {
  const variableId = String(variableIdRaw || '').trim();
  if (!variableId) return { path: null, aliasChain: [], resolved: null };

  const visited = new Set<string>();
  const aliasChain: string[] = [];
  let currentId: string | null = variableId;
  let resolved: string | null = null;

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const entry = variableTraceById.get(currentId);
    if (!entry) break;
    aliasChain.push(entry.path);
    if (entry.aliasTargetId) {
      currentId = entry.aliasTargetId;
      continue;
    }
    resolved = entry.rawValue;
    break;
  }

  if (aliasChain.length === 0) return { path: null, aliasChain: [], resolved: null };
  return {
    path: aliasChain[0] || null,
    aliasChain,
    resolved,
  };
}

/**
 * Build capture targets from source candidates.
 */
export async function buildCaptureTargets(
  options: BuildCaptureTargetsOptions,
): Promise<BuildCaptureTargetsResult> {
  const {
    sourceCandidates,
    descriptor,
    ctx,
    docsRootOverride,
    applySlugOverride,
    componentSlugOverride,
    slugByNodeFromRegistry,
    slugByNodeFromSpecs,
    includeSpecExhibits,
    figmaToken,
    repoRoot,
    ensureFilePayload,
    fetchFigmaNodes,
    fetchFigmaImages,
    extractComponentSpec,
    resolveSpecExhibitNodeIds,
    buildFigmaNodeUrl,
    classifyTargetKind,
    stderrWrite = process.stderr.write.bind(process.stderr),
    specExistsFn,
  } = options;

  const targets: CaptureTarget[] = [];
  const skipped: SkippedTarget[] = [];
  const slugByNodeFromRegistryMap = normalizeSlugLookup(slugByNodeFromRegistry);
  const slugByNodeFromSpecsMap = normalizeSlugLookup(slugByNodeFromSpecs);
  const inputDir = String((ctx as { paths?: { input?: unknown } })?.paths?.input || '').trim();
  const variableTraceById = await buildVariableTraceMap(inputDir);

  for (const candidate of sourceCandidates) {
    const nodeId = String(candidate.node_id || '').trim();
    if (!nodeId) continue;
    const inferredSlug = resolveInferredSlug({
      applySlugOverride,
      componentSlugOverride,
      slugByNodeFromRegistry: slugByNodeFromRegistryMap,
      slugByNodeFromSpecs: slugByNodeFromSpecsMap,
      nodeId,
      candidateName: candidate.name,
    });

    if (!inferredSlug) {
      skipped.push({
        node_id: nodeId,
        name: String(candidate.name || '').trim() || nodeId,
        reason: 'slug-resolution-failed',
      });
      continue;
    }

    const resolvedPaths: DocsPaths = resolveDocsPaths({
      ctx: ctx as import('../types/capture-path-resolver.js').CaptureContext,
      docsRootOverride,
      slug: inferredSlug,
    });
    const nodeUrl = buildFigmaNodeUrl(descriptor, nodeId) || descriptor.figmaUrl || descriptor.sourceUrl || '';
    let extractedNodeSpec: ExtractedComponentSpec | null = null;
    let specExhibits: SpecExhibits | null = null;

    try {
      const fullNodePayload = await fetchFigmaNodes({
        fileKey: descriptor.fileKey,
        nodeIds: [nodeId],
        token: figmaToken,
      });
      const nodeEntry = fullNodePayload?.nodes?.[nodeId]?.document ?? null;
      if (nodeEntry) {
        extractedNodeSpec = extractComponentSpec(nodeEntry, {
          resolveTokenTraceByVariableId: (variableId) =>
            resolveTokenTrace(variableTraceById, variableId),
        });
      }
    } catch (error) {
      stderrWrite(buildNodeErrorMessage('Node extraction failed', nodeId, error));
    }

    if (includeSpecExhibits) {
      try {
        const fileTree = await ensureFilePayload();
        const exhibitNodeIds = resolveSpecExhibitNodeIds({
          figmaFilePayload: fileTree,
          targetNodeId: nodeId,
        });
        if (exhibitNodeIds) {
          const exhibitNodeIdsArray = [
            exhibitNodeIds.anatomyNodeId,
            exhibitNodeIds.propertiesNodeId,
            exhibitNodeIds.layoutNodeId,
          ].filter((id): id is string => Boolean(id));
          const uniqueNodeIds = Array.from(new Set(exhibitNodeIdsArray));
          let imagesByNodeId: Record<string, string> = {};
          if (uniqueNodeIds.length > 0) {
            const imagesPayload = await fetchFigmaImages({
              fileKey: descriptor.fileKey,
              nodeIds: uniqueNodeIds,
              token: figmaToken,
              format: 'png',
              scale: 2,
            });
            imagesByNodeId =
              imagesPayload?.images && typeof imagesPayload.images === 'object'
                ? imagesPayload.images
                : {};
          }

          specExhibits = {
            specsNodeId: exhibitNodeIds.specsNodeId || null,
            anatomy: mapSpecExhibit(exhibitNodeIds.anatomyNodeId, imagesByNodeId),
            properties: mapSpecExhibit(exhibitNodeIds.propertiesNodeId, imagesByNodeId),
            layout: mapSpecExhibit(exhibitNodeIds.layoutNodeId, imagesByNodeId),
          };
        }
      } catch (error) {
        stderrWrite(buildNodeErrorMessage('Specs exhibit extraction failed', nodeId, error));
      }
    }

    const specExists = specExistsFn(resolvedPaths.specPath);

    targets.push({
      slug: inferredSlug,
      nodeId,
      name: String(candidate.name || '').trim() || inferredSlug,
      kind: classifyTargetKind(candidate.kind),
      pageName: String(candidate.page_name || '').trim() || null,
      specExists,
      nodeUrl,
      specExhibits,
    });
  }

  return { targets, skipped };
}
