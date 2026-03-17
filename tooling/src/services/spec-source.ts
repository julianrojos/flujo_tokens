/**
 * Spec Source Utilities
 *
 * Parse Figma URLs and resolve component source information.
 */
import { normalizeNodeId } from '../utils/figma-node-id.js';
import { assertFigmaSourceProvided } from './spec-run-guards.js';

export interface ParsedFigmaUrl {
  fileKey: string;
  nodeId: string;
}

export interface FigmaSourceArgs {
  figmaUrl?: string;
  nodeId?: string;
  rawComponentName?: string;
}

export interface ResolvedFigmaSource {
  fileKeyFromUrl: string;
  nodeId: string;
}

/**
 * Parse a Figma URL to extract file key and node ID.
 * Handles various URL formats and node ID parameter names.
 *
 * @param figmaUrl - Figma URL to parse
 * @returns Parsed file key and normalized node ID
 */
export function parseFigmaUrl(figmaUrl?: string): ParsedFigmaUrl {
  if (!figmaUrl) return { fileKey: '', nodeId: '' };

  let url: URL;
  try {
    url = new URL(figmaUrl);
  } catch {
    return { fileKey: '', nodeId: '' };
  }

  const pathnameParts = url.pathname.split('/').filter(Boolean);
  const keyRootIndex = pathnameParts.findIndex(
    (part) => part === 'design' || part === 'file'
  );
  const fileKey =
    keyRootIndex >= 0 && pathnameParts[keyRootIndex + 1]
      ? pathnameParts[keyRootIndex + 1]
      : '';

  const nodeParamKeys = ['node-id', 'node_id', 'nodeId'];
  let rawNodeId = '';
  for (const key of nodeParamKeys) {
    const value = url.searchParams.get(key);
    if (value) {
      rawNodeId = value;
      break;
    }
  }

  if (!rawNodeId) {
    const hashRaw = String(url.hash || '').replace(/^#/, '');
    if (hashRaw) {
      const hashParams = new URLSearchParams(hashRaw.replace(/^[/?]+/, ''));
      for (const key of nodeParamKeys) {
        const value = hashParams.get(key);
        if (value) {
          rawNodeId = value;
          break;
        }
      }

      if (!rawNodeId) {
        const match = hashRaw.match(/(?:^|[?&])node-?id=([^&]+)/i);
        if (match && match[1]) {
          rawNodeId = decodeURIComponent(match[1]);
        }
      }
    }
  }

  const nodeId = normalizeNodeId(rawNodeId);
  return { fileKey, nodeId };
}

/**
 * Resolve Figma source from provided arguments.
 * Validates that at least one source is provided.
 *
 * @param args - Figma source arguments
 * @returns Resolved file key and node ID
 * @throws Error if no Figma source is provided or if nodeId is empty when URL is provided without componentName
 */
export function resolveFigmaSource(args: FigmaSourceArgs): ResolvedFigmaSource {
  const { figmaUrl, nodeId, rawComponentName } = args;
  
  // First validate that at least one source is provided
  assertFigmaSourceProvided({ figmaUrl, nodeId, rawComponentName });
  
  // First check: if nodeId is explicitly provided, use it directly
  if (nodeId) {
    const parsedUrl = parseFigmaUrl(figmaUrl);
    return {
      fileKeyFromUrl: parsedUrl.fileKey,
      nodeId,
    };
  }
  
  // Special case: rawComponentName without URL is valid (nodeId will be resolved later)
  if (rawComponentName && !figmaUrl) {
    return {
      fileKeyFromUrl: '',
      nodeId: '',
    };
  }
  
  // Special case: rawComponentName with URL but no nodeId is valid (componentName is the source)
  // If URL has nodeId, use it; otherwise leave empty for componentName resolution
  if (rawComponentName && figmaUrl) {
    const parsedUrl = parseFigmaUrl(figmaUrl);
    return {
      fileKeyFromUrl: parsedUrl.fileKey,
      nodeId: parsedUrl.nodeId || '',  // Use URL nodeId if available, empty otherwise
    };
  }
  
  // Standard case: figmaUrl without explicit nodeId or rawComponentName
  const parsedUrl = parseFigmaUrl(figmaUrl);
  const fileKeyFromUrl = parsedUrl.fileKey;
  const resolvedNodeId = parsedUrl.nodeId;
  
  // Validate that nodeId is not empty after parsing (only when URL is provided without componentName)
  if (figmaUrl && !resolvedNodeId) {
    throw new Error(
      `No node-id found in Figma URL: ${figmaUrl}\n` +
      'Provide --component-set-node-id <node-id> or ensure URL contains node-id parameter.'
    );
  }

  return {
    fileKeyFromUrl,
    nodeId: resolvedNodeId,
  };
}
