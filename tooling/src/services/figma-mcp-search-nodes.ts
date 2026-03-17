/**
 * Figma MCP Search Nodes Service
 *
 * Provides surgical node search without loading full tree.
 * Uses MCP tool 'figma_search_nodes' when available, with controlled fallback.
 */

import type { FetchFigmaVariablesViaMcpOptions } from './figma-mcp-variables.js';

type SearchMcpModule = Pick<
  typeof import('./figma-mcp-variables.js'),
  'getOrCreateSharedMcpClient'
>;

// Dynamic import for MCP client access
let _mcpModule: SearchMcpModule | null = null;

async function getMcpModule(): Promise<SearchMcpModule> {
  if (!_mcpModule) {
    _mcpModule = await import('./figma-mcp-variables.js');
  }
  return _mcpModule;
}

export function setSearchMcpModuleForTesting(module: SearchMcpModule | null): void {
  _mcpModule = module;
}

export interface SearchFigmaNodesOptions extends FetchFigmaVariablesViaMcpOptions {
  /**
   * Search query: substring to match in node names.
   * Minimum 2 characters after trim.
   */
  nameContains: string;
  /**
   * Optional parent node ID to scope search.
   * If omitted, searches from root.
   */
  parentId?: string;
  /**
   * Optional node types to filter.
   * If omitted, returns all types.
   */
  nodeTypes?: string[];
  /**
   * Maximum results to return. Default 20, max 50.
   */
  limit?: number;
  /**
   * If true, requires exact match (case-insensitive).
   */
  exactMatch?: boolean;
  /**
   * Timeout in milliseconds for the search operation.
   * Default 15000ms.
   */
  timeoutMs?: number;
}

export interface SearchNodeResult {
  id: string;
  name: string;
  type: string;
  parentId?: string;
}

export interface SearchFigmaNodesResult {
  ok: true;
  source: 'search_tool' | 'fallback_list';
  nodes: SearchNodeResult[];
  count: number;
  truncated: boolean;
  query: {
    nameContains: string;
    nodeTypes?: string[];
    limit: number;
    exactMatch: boolean;
  };
  elapsedMs: number;
}

export interface SearchFigmaNodesError {
  ok: false;
  code: string;
  message: string;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MIN_QUERY_LENGTH = 2;
const DEFAULT_TIMEOUT_MS = 15_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isTimeoutLikeMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('timeout') ||
    lower.includes('timed out') ||
    lower.includes('timedout')
  );
}

function isSearchToolUnavailableError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('method not found') ||
    lower.includes('unknown tool') ||
    lower.includes('unknown method') ||
    lower.includes('not implemented')
  );
}

function extractToolErrorMessage(toolResult: unknown): string {
  if (!isRecord(toolResult)) {
    return '';
  }

  if (typeof toolResult.message === 'string' && toolResult.message.trim()) {
    return toolResult.message.trim();
  }

  const content = Array.isArray(toolResult.content) ? toolResult.content : [];
  const textBlocks: string[] = [];
  for (const entry of content) {
    if (!isRecord(entry)) continue;
    const text = String(entry.text || '').trim();
    if (!text) continue;
    textBlocks.push(text);

    const normalized = text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
    try {
      const parsed = JSON.parse(normalized);
      if (isRecord(parsed) && typeof parsed.message === 'string' && parsed.message.trim()) {
        return parsed.message.trim();
      }
      if (isRecord(parsed) && isRecord(parsed.error) && typeof parsed.error.message === 'string') {
        return String(parsed.error.message).trim();
      }
    } catch {
      // ignore parse failures, plain text fallback below
    }
  }

  return textBlocks.join(' ').trim();
}

/**
 * Allowed node types for filtering.
 */
const ALLOWED_NODE_TYPES = new Set([
  'FRAME',
  'GROUP',
  'COMPONENT',
  'INSTANCE',
  'TEXT',
  'RECTANGLE',
  'ELLIPSE',
  'LINE',
  'VECTOR',
  'IMAGE',
  'BOOLEAN_OPERATION',
  'POLYGON',
  'STAR',
  'SECTION',
]);

/**
 * Normalize and validate search query.
 */
export function normalizeSearchQuery(query: string): { ok: true; normalized: string } | { ok: false; code: string; message: string } {
  const trimmed = String(query || '').trim();
  
  if (trimmed.length < MIN_QUERY_LENGTH) {
    return {
      ok: false,
      code: 'search.name_too_short',
      message: `Search query must be at least ${MIN_QUERY_LENGTH} characters.`,
    };
  }
  
  return { ok: true, normalized: trimmed };
}

/**
 * Validate and normalize limit.
 */
export function normalizeSearchLimit(limit: unknown): { ok: true; limit: number } | { ok: false; code: string; message: string } {
  const parsed = Number(limit ?? DEFAULT_LIMIT);
  
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
    return {
      ok: false,
      code: 'search.invalid_limit',
      message: `Limit must be an integer between 1 and ${MAX_LIMIT}.`,
    };
  }
  
  return { ok: true, limit: parsed };
}

/**
 * Validate node types.
 */
export function normalizeNodeTypes(types: unknown): { ok: true; types: string[] } | { ok: false; code: string; message: string } {
  if (!types || !Array.isArray(types)) {
    return { ok: true, types: [] };
  }
  
  const validTypes = types
    .map(String)
    .filter(t => ALLOWED_NODE_TYPES.has(t.toUpperCase()));
  
  return { ok: true, types: validTypes.map(t => t.toUpperCase()) };
}

/**
 * Search Figma nodes using MCP tool 'figma_search_nodes'.
 * Falls back to 'figma_list_nodes' if search tool unavailable.
 */
export async function searchFigmaNodesViaMcp(
  options: SearchFigmaNodesOptions,
): Promise<SearchFigmaNodesResult | SearchFigmaNodesError> {
  const startedAt = Date.now();
  
  // Validate query
  const queryResult = normalizeSearchQuery(options.nameContains);
  if (queryResult.ok === false) {
    return queryResult;
  }
  
  // Validate limit
  const limitResult = normalizeSearchLimit(options.limit);
  if (limitResult.ok === false) {
    return limitResult;
  }
  
  // Validate node types
  const typesResult = normalizeNodeTypes(options.nodeTypes);
  if (typesResult.ok === false) {
    return typesResult;
  }
  
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const queryLower = queryResult.normalized.toLowerCase();
  const exactMatch = options.exactMatch ?? false;
  const requestedLimit = limitResult.limit;
  const fetchLimit = Math.min(requestedLimit + 1, MAX_LIMIT);
  
  try {
    const mcpModule = await getMcpModule();
    const client = await mcpModule.getOrCreateSharedMcpClient({
      fileUrl: options.fileUrl,
      env: options.env,
      timeoutMs,
    });
    
    // Try 'figma_search_nodes' tool first, fallback to list-based search
    let searchResult: SearchNodeResult[];
    let source: 'search_tool' | 'fallback_list' = 'fallback_list';
    
    try {
      // Attempt to use native search tool
      const toolResult = await client.callTool(
        'figma_search_nodes',
        {
          fileUrl: options.fileUrl,
          query: queryResult.normalized,
          parentId: options.parentId,
          nodeTypes: typesResult.types.length > 0 ? typesResult.types : undefined,
          limit: fetchLimit,
          exactMatch,
        },
        timeoutMs
      );
      
      if (toolResult.isError === true) {
        const toolErrorMessage = extractToolErrorMessage(toolResult) || 'figma_search_nodes returned isError=true.';
        throw new Error(toolErrorMessage);
      }
      searchResult = parseSearchToolResult(toolResult);
      source = 'search_tool';
    } catch (error) {
      const searchToolErrorMessage = error instanceof Error ? error.message : String(error);
      // Fallback only when search tool is unavailable on this MCP build.
      if (!isSearchToolUnavailableError(searchToolErrorMessage)) {
        throw error;
      }
      searchResult = await fallbackListSearch(client, options, queryLower, exactMatch, fetchLimit, typesResult.types);
      source = 'fallback_list';
    }
    
    const elapsedMs = Date.now() - startedAt;
    const visibleNodes = searchResult.slice(0, requestedLimit);
    const truncated = searchResult.length > requestedLimit;
    
    return {
      ok: true,
      source,
      nodes: visibleNodes,
      count: visibleNodes.length,
      truncated,
      query: {
        nameContains: queryResult.normalized,
        nodeTypes: typesResult.types.length > 0 ? typesResult.types : undefined,
        limit: requestedLimit,
        exactMatch,
      },
      elapsedMs,
    };
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : String(error);
    
    // Classify error
    if (isTimeoutLikeMessage(message) || elapsedMs >= timeoutMs) {
      return {
        ok: false,
        code: 'search.timeout',
        message: `Search timed out after ${timeoutMs}ms.`,
      };
    }
    
    if (message.toLowerCase().includes('not connected') || message.toLowerCase().includes('disconnected')) {
      return {
        ok: false,
        code: 'search.not_connected',
        message: 'MCP client not connected. Reconnect the MCP Management.',
      };
    }
    
    return {
      ok: false,
      code: 'search.mcp_failed',
      message: `MCP search failed: ${message}`,
    };
  }
}

/**
 * Parse payload from an MCP tool result object.
 * Priority: structuredContent > data > content[].text JSON.
 * Handles both direct JSON and content[].text JSON patterns.
 */
function parseMcpToolPayload(rawToolResult: unknown): unknown {
  if (!isRecord(rawToolResult)) {
    return null;
  }

  if (rawToolResult.structuredContent != null) {
    return rawToolResult.structuredContent;
  }

  if (rawToolResult.data != null) {
    return rawToolResult.data;
  }

  const content = Array.isArray(rawToolResult.content) ? rawToolResult.content : [];
  for (const entry of content) {
    if (!isRecord(entry)) continue;
    const text = String(entry.text || '').trim();
    if (!text) continue;

    const normalized = text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
    try {
      const parsed = JSON.parse(normalized);
      if (parsed != null) {
        return parsed;
      }
    } catch {
      // Keep scanning content blocks.
    }
  }

  if (content.length > 0) {
    return content;
  }

  return null;
}

/**
 * Extract a node-like array from tool payload.
 */
function extractNodesArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (!isRecord(payload)) {
    return [];
  }

  const candidates: unknown[] = [payload.nodes, payload.data, payload.result];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
    if (isRecord(candidate)) {
      const nested = [candidate.nodes, candidate.data, candidate.result];
      for (const nestedCandidate of nested) {
        if (Array.isArray(nestedCandidate)) {
          return nestedCandidate;
        }
      }
    }
  }

  return [];
}

/**
 * Parse content from figma_search_nodes tool response.
 */
function parseSearchToolResult(toolResult: unknown): SearchNodeResult[] {
  const payload = parseMcpToolPayload(toolResult);
  const nodesData = extractNodesArray(payload);

  return nodesData
    .filter(item => item && typeof item === 'object')
    .map(item => {
      const obj = item as Record<string, unknown>;
      return {
        id: String(obj.id || ''),
        name: String(obj.name || ''),
        type: String(obj.type || 'UNKNOWN'),
        parentId: obj.parentId ? String(obj.parentId) : undefined,
      };
    })
    .filter(node => node.id && node.name);
}

/**
 * Fallback search using figma_list_nodes with local filtering.
 */
async function fallbackListSearch(
  client: unknown,
  options: SearchFigmaNodesOptions,
  queryLower: string,
  exactMatch: boolean,
  fetchLimit: number,
  validTypes: string[]
): Promise<SearchNodeResult[]> {
  const nodes: SearchNodeResult[] = [];
  
  const mcpClient = client as {
    callTool: (name: string, params: Record<string, unknown>, timeoutMs?: number) => Promise<{
      isError?: boolean;
      content?: unknown;
    }>;
  };

  // Use figma_list_nodes with parentId scope
  const toolResult = await mcpClient.callTool(
    'figma_list_nodes',
    {
      fileUrl: options.fileUrl,
      parentId: options.parentId,
      limit: Math.max(fetchLimit, 200), // Fetch enough for local filtering
    },
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );
  
  if (toolResult.isError === true) {
    const toolErrorMessage = extractToolErrorMessage(toolResult) || 'figma_list_nodes returned isError=true.';
    throw new Error(toolErrorMessage);
  }
  
  const allNodes = parseListToolContent(toolResult);
  
  for (const node of allNodes) {
    const nameLower = node.name.toLowerCase();
    const matches = exactMatch
      ? nameLower === queryLower
      : nameLower.includes(queryLower);
    
    if (!matches) continue;
    
    // Filter by types if specified
    if (validTypes.length > 0 && !validTypes.includes(node.type)) {
      continue;
    }
    
    nodes.push(node);
    
    if (nodes.length >= fetchLimit) {
      break;
    }
  }
  
  return nodes;
}

/**
 * Parse content from figma_list_nodes tool response.
 */
function parseListToolContent(toolResult: unknown): SearchNodeResult[] {
  const parsed = parseMcpToolPayload(toolResult);
  const nodesData = extractNodesArray(parsed);

  return nodesData
    .filter(item => item && typeof item === 'object')
    .map(item => {
      const obj = item as Record<string, unknown>;
      return {
        id: String(obj.id || ''),
        name: String(obj.name || ''),
        type: String(obj.type || 'UNKNOWN'),
        parentId: obj.parentId ? String(obj.parentId) : undefined,
      };
    })
    .filter(node => node.id && node.name);
}
