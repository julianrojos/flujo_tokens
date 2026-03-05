/**
 * Capture Figma Context
 *
 * Configures Figma API context for capture operations.
 * Handles file payload caching and node resolution.
 */

import { fetchFigmaFile, fetchFigmaNodes } from './figma-api.js';
import { extractSingleNodeCandidate } from './figma-component-discovery.js';
import { buildFigmaComponentMap, type ParsedFigmaFileUrl } from './figma-component-map.js';
import type { FigmaComponentMap } from './figma-component-map.js';
import type { FigmaDescriptor } from './capture-target-builder.js';
import type { SourceCandidate } from './capture-target-builder.js';
import type { FigmaNode } from '../types/figma.js';

/**
 * Options for configuring Figma context.
 */
export interface ConfigureFigmaContextOptions {
  descriptor: FigmaDescriptor;
  figmaToken: string;
  fetchFigmaFileFn?: typeof fetchFigmaFile;
  fetchFigmaNodesFn?: typeof fetchFigmaNodes;
  extractSingleNodeCandidateFn?: typeof extractSingleNodeCandidate;
  buildFigmaComponentMapFn?: typeof buildFigmaComponentMap;
}

/**
 * Result of resolving Figma context.
 */
export interface ResolveFigmaContextResult {
  componentMap: FigmaComponentMap | null;
  singleNodeCandidate: SourceCandidate | null;
}

/**
 * Return type for configureFigmaContext.
 */
export interface FigmaContext {
  ensureFilePayload: () => Promise<unknown>;
  resolveContext: () => Promise<ResolveFigmaContextResult>;
  getFilePayload: () => unknown | null;
}

interface FigmaFilePayload {
  document: FigmaNode;
  components: Record<string, unknown>;
  componentSets: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isFigmaNode(value: unknown): value is FigmaNode {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.type === 'string'
  );
}

function toFigmaFilePayload(payload: unknown): FigmaFilePayload {
  if (!isRecord(payload) || !isFigmaNode(payload.document)) {
    throw new Error('Invalid Figma file payload: missing document node.');
  }

  return {
    document: payload.document,
    components: isRecord(payload.components) ? payload.components : {},
    componentSets: isRecord(payload.componentSets) ? payload.componentSets : {},
  };
}

function toParsedFigmaFileUrl(descriptor: FigmaDescriptor): ParsedFigmaFileUrl {
  const fileKey = String(descriptor.fileKey || '').trim();
  if (!fileKey) {
    throw new Error('Invalid Figma descriptor: missing fileKey.');
  }

  const fileSlug = String(descriptor.fileSlug || descriptor.fileName || fileKey).trim();
  const fileName = String(descriptor.fileName || descriptor.fileSlug || fileKey).trim();
  const surface = String(descriptor.surface || 'design').trim() || 'design';
  const rootNodeId = String(descriptor.rootNodeId || '').trim();
  const figmaUrl = String(descriptor.figmaUrl || descriptor.sourceUrl || '').trim();
  if (!figmaUrl) {
    throw new Error('Invalid Figma descriptor: missing figmaUrl/sourceUrl.');
  }

  return {
    fileKey,
    fileName,
    fileSlug,
    surface,
    rootNodeId,
    figmaUrl,
    nodeIdFromUrl: String(descriptor.nodeIdFromUrl || '').trim() || undefined,
  };
}

/**
 * Configure Figma context for capture operations.
 */
export function configureFigmaContext(
  options: ConfigureFigmaContextOptions,
): FigmaContext {
  const {
    descriptor,
    figmaToken,
    fetchFigmaFileFn = fetchFigmaFile,
    fetchFigmaNodesFn = fetchFigmaNodes,
    extractSingleNodeCandidateFn = extractSingleNodeCandidate,
    buildFigmaComponentMapFn = buildFigmaComponentMap,
  } = options;

  let filePayload: unknown | null = null;

  const ensureFilePayload = async (): Promise<unknown> => {
    if (filePayload) return filePayload;
    filePayload = await fetchFigmaFileFn({
      fileKey: descriptor.fileKey,
      token: figmaToken,
    });
    return filePayload;
  };

  const resolveContext = async (): Promise<ResolveFigmaContextResult> => {
    let componentMap: FigmaComponentMap | null = null;
    let singleNodeCandidate: SourceCandidate | null = null;

    if (descriptor.nodeIdFromUrl) {
      try {
        const nodePayload = await fetchFigmaNodesFn({
          fileKey: String(descriptor.fileKey),
          nodeIds: [String(descriptor.nodeIdFromUrl)],
          token: figmaToken,
          depth: 1,
        });
        const normalizedPayload = isRecord(nodePayload) ? nodePayload : null;
        const extractedCandidate = extractSingleNodeCandidateFn(
          normalizedPayload,
          String(descriptor.nodeIdFromUrl),
        );
        singleNodeCandidate = {
          node_id: extractedCandidate.node_id,
          name: extractedCandidate.name,
          kind: extractedCandidate.kind,
          page_name: extractedCandidate.page_name,
        };
      } catch {
        singleNodeCandidate = {
          node_id: String(descriptor.nodeIdFromUrl),
          name: String(descriptor.nodeIdFromUrl),
          kind: 'unknown',
          page_name: undefined,
        };
      }
    } else {
      filePayload = await ensureFilePayload();
      const typedPayload = toFigmaFilePayload(filePayload);
      componentMap = buildFigmaComponentMapFn(
        toParsedFigmaFileUrl(descriptor),
        typedPayload.document,
        typedPayload.components,
        typedPayload.componentSets,
        true,
      );
    }

    return {
      componentMap,
      singleNodeCandidate,
    };
  };

  /**
   * filePayload is internally cached after ensureFilePayload is called
   * to avoid duplicate network requests for the same Figma file.
   */
  return {
    ensureFilePayload,
    resolveContext,
    getFilePayload: () => filePayload,
  };
}
