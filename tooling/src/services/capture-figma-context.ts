/**
 * Capture Figma Context
 *
 * Configures Figma API context for capture operations.
 * Handles file payload caching and node resolution.
 */

import { fetchFigmaFile, fetchFigmaNodes } from './figma-api.js';
import { extractSingleNodeCandidate } from './figma-component-discovery.js';
import { buildFigmaComponentMap } from './figma-component-map.js';
import type { FigmaDescriptor, FigmaComponentMap } from './figma-component-map.js';
import type { SourceCandidate } from './capture-target-builder.js';

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
          fileKey: descriptor.fileKey,
          nodeIds: [descriptor.nodeIdFromUrl],
          token: figmaToken,
          depth: 1,
        });
        singleNodeCandidate = extractSingleNodeCandidateFn(nodePayload, descriptor.nodeIdFromUrl);
      } catch {
        singleNodeCandidate = {
          node_id: descriptor.nodeIdFromUrl,
          name: descriptor.nodeIdFromUrl,
          kind: 'unknown',
          page_name: null,
        };
      }
    } else {
      filePayload = await ensureFilePayload();
      componentMap = buildFigmaComponentMapFn({
        filePayload,
        fileDescriptor: descriptor,
        includeInstances: true,
      });
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
