/**
 * Capture Figma Context
 *
 * Configures and resolves Figma context for capture workflows.
 * Handles file payload fetching and component map resolution.
 */

import type { FigmaFileDescriptor, FigmaNodePayload, FigmaComponentMap } from '../types/figma.js';

/**
 * Single node candidate for capture.
 */
export interface FigmaNodeCandidate {
  /** Node ID. */
  node_id: string;
  /** Node display name. */
  name: string;
  /** Node kind (component_set, component, unknown). */
  kind: string;
  /** Page name where node is located. */
  page_name: string | null;
}

/**
 * Figma context resolution result.
 */
export interface FigmaContextResult {
  /** Component map built from Figma file (for document URLs). */
  componentMap: FigmaComponentMap | null;
  /** Single node candidate (for node-specific URLs). */
  singleNodeCandidate: FigmaNodeCandidate | null;
}

/**
 * Figma context configuration options.
 */
export interface FigmaContextOptions {
  /** Parsed Figma URL descriptor. */
  descriptor: FigmaFileDescriptor;
  /** Figma API token. */
  figmaToken: string;
  /** Function to fetch Figma file. */
  fetchFigmaFileFn?: (params: { fileKey: string; token: string }) => Promise<unknown>;
  /** Function to fetch Figma nodes. */
  fetchFigmaNodesFn?: (params: {
    fileKey: string;
    nodeIds: string[];
    token: string;
    depth?: number;
  }) => Promise<FigmaNodePayload>;
  /** Function to extract single node candidate. */
  extractSingleNodeCandidateFn?: (
    payload: FigmaNodePayload,
    nodeId: string,
  ) => FigmaNodeCandidate | null;
  /** Function to build Figma component map. */
  buildFigmaComponentMapFn?: (params: {
    filePayload: unknown;
    fileDescriptor: FigmaFileDescriptor;
    includeInstances?: boolean;
  }) => FigmaComponentMap;
}

/**
 * Figma context API.
 */
export interface FigmaContextApi {
  /** Ensure file payload is fetched (cached). */
  ensureFilePayload: () => Promise<unknown>;
  /** Resolve context (component map or single node). */
  resolveContext: () => Promise<FigmaContextResult>;
  /** Get cached file payload. */
  getFilePayload: () => unknown | null;
}

/**
 * Configure Figma context for capture workflow.
 *
 * Provides lazy loading of Figma file payload and resolution of
 * component context (either single node or full component map).
 *
 * @param options - Figma context options.
 * @returns Figma context API with cached file payload.
 */
export function configureFigmaContext(options: FigmaContextOptions): FigmaContextApi {
  const {
    descriptor,
    figmaToken,
    fetchFigmaFileFn,
    fetchFigmaNodesFn,
    extractSingleNodeCandidateFn,
    buildFigmaComponentMapFn,
  } = options;

  let filePayload: unknown | null = null;

  /**
   * Ensure file payload is fetched (cached after first call).
   */
  const ensureFilePayload = async (): Promise<unknown> => {
    if (filePayload) {
      return filePayload;
    }

    if (!fetchFigmaFileFn) {
      throw new Error('fetchFigmaFileFn is required');
    }

    filePayload = await fetchFigmaFileFn({
      fileKey: descriptor.fileKey,
      token: figmaToken,
    });

    return filePayload;
  };

  /**
   * Resolve Figma context based on URL type.
   *
   * For node-specific URLs: fetches single node and extracts candidate.
   * For document URLs: fetches full file and builds component map.
   */
  const resolveContext = async (): Promise<FigmaContextResult> => {
    let componentMap: FigmaComponentMap | null = null;
    let singleNodeCandidate: FigmaNodeCandidate | null = null;

    if (descriptor.nodeIdFromUrl) {
      // Node-specific URL: fetch single node
      try {
        if (!fetchFigmaNodesFn) {
          throw new Error('fetchFigmaNodesFn is required');
        }

        const nodePayload = await fetchFigmaNodesFn({
          fileKey: descriptor.fileKey,
          nodeIds: [descriptor.nodeIdFromUrl],
          token: figmaToken,
          depth: 1,
        });

        if (!extractSingleNodeCandidateFn) {
          throw new Error('extractSingleNodeCandidateFn is required');
        }

        singleNodeCandidate = extractSingleNodeCandidateFn(
          nodePayload,
          descriptor.nodeIdFromUrl,
        );
      } catch (error) {
        // Fallback: create minimal candidate from node ID
        // Log error for debugging but don't fail the entire operation
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(
          `[capture-figma-context] Failed to fetch node ${descriptor.nodeIdFromUrl}: ${errorMessage}. Using fallback.`,
        );
        singleNodeCandidate = {
          node_id: descriptor.nodeIdFromUrl,
          name: descriptor.nodeIdFromUrl,
          kind: 'unknown',
          page_name: null,
        };
      }
    } else {
      // Document URL: fetch full file and build component map
      filePayload = await ensureFilePayload();

      if (!buildFigmaComponentMapFn) {
        throw new Error('buildFigmaComponentMapFn is required');
      }

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
   * Get cached file payload (if available).
   */
  const getFilePayload = (): unknown | null => filePayload;

  return {
    ensureFilePayload,
    resolveContext,
    getFilePayload,
  };
}
