/**
 * Figma MCP Surgical Queries Service
 *
 * Provides low-cost surgical queries: get-children, search-styles, search-variables.
 */

import type { FetchFigmaVariablesViaMcpOptions } from './figma-mcp-variables.js';
import type { FigmaVariablesResponse } from '../utils/figma.js';

interface SurgicalMcpClient {
  callTool: (
    name: string,
    params: Record<string, unknown>,
    timeoutMs?: number,
  ) => Promise<{
    isError?: boolean;
    structuredContent?: unknown;
    data?: unknown;
    content?: unknown;
  }>;
}

interface SurgicalMcpModule {
  getOrCreateSharedMcpClient: (
    options: FetchFigmaVariablesViaMcpOptions,
  ) => Promise<SurgicalMcpClient>;
  fetchFigmaLocalVariablesViaMcp: (
    options: FetchFigmaVariablesViaMcpOptions,
  ) => Promise<FigmaVariablesResponse>;
}

// Dynamic import for MCP client access
let _mcpModule: SurgicalMcpModule | null = null;

async function getMcpModule(): Promise<SurgicalMcpModule> {
  if (!_mcpModule) {
    _mcpModule = await import('./figma-mcp-variables.js');
  }
  return _mcpModule;
}

export function setSurgicalMcpModuleForTesting(module: SurgicalMcpModule | null): void {
  _mcpModule = module;
}

// ============================================================================
// Common Types
// ============================================================================

export interface SurgicalQueryOptions extends FetchFigmaVariablesViaMcpOptions {
  limit?: number;
  timeoutMs?: number;
}

export interface SurgicalQueryResult<T> {
  ok: true;
  source: 'mcp_tool' | 'fallback';
  items: T[];
  count: number;
  truncated: boolean;
  query: Record<string, unknown>;
  elapsedMs: number;
}

export interface SurgicalQueryError {
  ok: false;
  code: string;
  message: string;
  retryable?: boolean;
}

// ============================================================================
// Get Children
// ============================================================================

export interface GetChildrenOptions extends SurgicalQueryOptions {
  parentId: string;
  cursor?: string;
}

export interface ChildNodeResult {
  id: string;
  name: string;
  type: string;
  parentId?: string;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Get children of a specific node.
 */
export async function getChildrenViaMcp(
  options: GetChildrenOptions,
): Promise<SurgicalQueryResult<ChildNodeResult> | SurgicalQueryError> {
  const startedAt = Date.now();
  const limit = Math.min(options.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (!options.parentId) {
    return {
      ok: false,
      code: 'get_children.parent_missing',
      message: 'parentId is required.',
    };
  }

  try {
    const mcpModule = await getMcpModule();
    const client = await mcpModule.getOrCreateSharedMcpClient({
      fileUrl: options.fileUrl,
      env: options.env,
      timeoutMs,
    });

    let items: ChildNodeResult[] = [];
    let source: 'mcp_tool' | 'fallback' = 'mcp_tool';

    try {
      // Try native figma_get_children or figma_list_nodes with parentId
      const toolResult = await client.callTool(
        'figma_list_nodes',
        {
          fileUrl: options.fileUrl,
          parentId: options.parentId,
          limit,
        },
        timeoutMs
      );

      if (toolResult.isError !== true) {
        // Parse with priority: structuredContent > data > content.text
        const payload = toolResult.structuredContent ?? toolResult.data ?? toolResult.content;
        if (payload) {
          items = parseNodesFromContent(payload, options.parentId);
          source = 'mcp_tool';
        } else {
          throw new Error('Tool returned empty response');
        }
      } else {
        throw new Error('Tool returned error');
      }
    } catch (error) {
      // Classify error before deciding response
      const msg = error instanceof Error ? error.message : String(error);
      
      if (/method not found|unknown (tool|method)/i.test(msg)) {
        return {
          ok: false,
          code: 'get_children.not_available',
          message: 'get_children tool not available in this MCP version.',
        };
      }
      
      if (/(timeout|timed out|timedout)/i.test(msg)) {
        return {
          ok: false,
          code: 'get_children.timeout',
          message: `MCP get children timed out after ${timeoutMs}ms.`,
          retryable: true,
        };
      }
      
      if (/not connected|disconnected/i.test(msg)) {
        return {
          ok: false,
          code: 'get_children.not_connected',
          message: 'MCP client not connected.',
          retryable: true,
        };
      }
      
      return {
        ok: false,
        code: 'get_children.mcp_failed',
        message: `MCP get children failed: ${msg}`,
        retryable: false,
      };
    }

    const elapsedMs = Date.now() - startedAt;

    return {
      ok: true,
      source,
      items: items.slice(0, limit),
      count: items.length,
      truncated: items.length >= limit,
      query: {
        parentId: options.parentId,
        limit,
        cursor: options.cursor,
      },
      elapsedMs,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      code: 'get_children.mcp_failed',
      message: `MCP get children failed: ${message}`,
    };
  }
}

// ============================================================================
// Search Styles
// ============================================================================

export interface SearchStylesOptions extends SurgicalQueryOptions {
  nameContains: string;
  styleType?: 'FILL' | 'STROKE' | 'TEXT' | 'GRID' | 'EFFECT';
}

export interface StyleResult {
  id: string;
  name: string;
  styleType: string;
  key?: string;
}

/**
 * Search styles by name.
 */
export async function searchStylesViaMcp(
  options: SearchStylesOptions,
): Promise<SurgicalQueryResult<StyleResult> | SurgicalQueryError> {
  const startedAt = Date.now();
  const limit = Math.min(options.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (!options.nameContains || options.nameContains.trim().length < 2) {
    return {
      ok: false,
      code: 'search_styles.name_too_short',
      message: 'nameContains must be at least 2 characters.',
    };
  }

  try {
    const mcpModule = await getMcpModule();
    const client = await mcpModule.getOrCreateSharedMcpClient({
      fileUrl: options.fileUrl,
      env: options.env,
      timeoutMs,
    });

    let items: StyleResult[] = [];
    let source: 'mcp_tool' | 'fallback' = 'mcp_tool';

    try {
      // Try native figma_search_styles or fallback to figma_get_styles
      const toolResult = await client.callTool(
        'figma_get_styles',
        {
          fileUrl: options.fileUrl,
        },
        timeoutMs
      );

      if (toolResult.isError !== true) {
        // Parse with priority: structuredContent > data > content.text
        const payload = toolResult.structuredContent ?? toolResult.data ?? toolResult.content;
        if (payload) {
          items = parseStylesFromContent(payload, options.nameContains, options.styleType);
          source = 'fallback';
        } else {
          throw new Error('Tool returned empty response');
        }
      } else {
        throw new Error('Tool returned error');
      }
    } catch (error) {
      // Classify error before deciding response
      const msg = error instanceof Error ? error.message : String(error);
      
      if (/method not found|unknown (tool|method)/i.test(msg)) {
        return {
          ok: false,
          code: 'search_styles.not_available',
          message: 'Style search tool not available in this MCP version.',
        };
      }
      
      if (/(timeout|timed out|timedout)/i.test(msg)) {
        return {
          ok: false,
          code: 'search_styles.timeout',
          message: `MCP search styles timed out after ${timeoutMs}ms.`,
          retryable: true,
        };
      }
      
      if (/not connected|disconnected/i.test(msg)) {
        return {
          ok: false,
          code: 'search_styles.not_connected',
          message: 'MCP client not connected.',
          retryable: true,
        };
      }
      
      return {
        ok: false,
        code: 'search_styles.mcp_failed',
        message: `MCP search styles failed: ${msg}`,
        retryable: false,
      };
    }

    const elapsedMs = Date.now() - startedAt;

    return {
      ok: true,
      source,
      items: items.slice(0, limit),
      count: items.length,
      truncated: items.length >= limit,
      query: {
        nameContains: options.nameContains,
        styleType: options.styleType,
        limit,
      },
      elapsedMs,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      code: 'search_styles.mcp_failed',
      message: `MCP search styles failed: ${message}`,
    };
  }
}

// ============================================================================
// Search Variables
// ============================================================================

export interface SearchVariablesOptions extends SurgicalQueryOptions {
  nameContains: string;
  collection?: string;
  mode?: string;
}

export interface VariableResult {
  id: string;
  name: string;
  resolvedType: string;
  variableCollectionId?: string;
  valuesByMode?: Record<string, unknown>;
}

/**
 * Search variables by name with optional collection/mode filters.
 */
export async function searchVariablesViaMcp(
  options: SearchVariablesOptions,
): Promise<SurgicalQueryResult<VariableResult> | SurgicalQueryError> {
  const startedAt = Date.now();
  const limit = Math.min(options.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (!options.nameContains || options.nameContains.trim().length < 2) {
    return {
      ok: false,
      code: 'search_variables.name_too_short',
      message: 'nameContains must be at least 2 characters.',
    };
  }

  try {
    const mcpModule = await getMcpModule();

    let items: VariableResult[] = [];

    try {
      // Use existing fetchFigmaLocalVariablesViaMcp and filter locally
      const allVariables = await mcpModule.fetchFigmaLocalVariablesViaMcp({
        fileUrl: options.fileUrl,
        env: options.env,
        timeoutMs,
      });

      const queryLower = options.nameContains.toLowerCase();
      
      for (const [varId, variable] of Object.entries(allVariables.meta.variables)) {
        // Filter by name
        if (!variable.name.toLowerCase().includes(queryLower)) {
          continue;
        }

        // Filter by collection if specified
        if (options.collection && variable.variableCollectionId !== options.collection) {
          continue;
        }

        items.push({
          id: varId,
          name: variable.name,
          resolvedType: variable.resolvedType || 'UNKNOWN',
          variableCollectionId: variable.variableCollectionId,
          valuesByMode: variable.valuesByMode,
        });

        if (items.length >= limit) {
          break;
        }
      }
    } catch (searchError) {
      // Classify error before deciding response
      const msg = searchError instanceof Error ? searchError.message : String(searchError);
      
      if (/(timeout|timed out|timedout)/i.test(msg)) {
        return {
          ok: false,
          code: 'search_variables.timeout',
          message: `MCP search variables timed out after ${timeoutMs}ms.`,
          retryable: true,
        };
      }
      
      if (/not connected|disconnected/i.test(msg)) {
        return {
          ok: false,
          code: 'search_variables.not_connected',
          message: 'MCP client not connected.',
          retryable: true,
        };
      }
      
      return {
        ok: false,
        code: 'search_variables.mcp_failed',
        message: `MCP search variables failed: ${msg}`,
        retryable: false,
      };
    }

    const elapsedMs = Date.now() - startedAt;

    return {
      ok: true,
      source: 'fallback',
      items: items.slice(0, limit),
      count: items.length,
      truncated: items.length >= limit,
      query: {
        nameContains: options.nameContains,
        collection: options.collection,
        mode: options.mode,
        limit,
      },
      elapsedMs,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      code: 'search_variables.mcp_failed',
      message: `MCP search variables failed: ${message}`,
    };
  }
}

// ============================================================================
// Parsing Helpers
// ============================================================================

function parseMcpToolContent(content: unknown): Record<string, unknown> | null {
  if (!content) return null;
  
  if (typeof content === 'object' && !Array.isArray(content)) {
    return content as Record<string, unknown>;
  }
  
  if (Array.isArray(content)) {
    for (const entry of content) {
      if (!entry || typeof entry !== 'object') continue;
      const entryObj = entry as Record<string, unknown>;
      const text = String(entryObj.text || '').trim();
      if (!text) continue;
      
      const normalized = text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
      try {
        const parsed = JSON.parse(normalized);
        if (parsed && typeof parsed === 'object') {
          return parsed as Record<string, unknown>;
        }
      } catch {
        // keep scanning
      }
    }
  }
  
  return null;
}

function parseNodesFromContent(content: unknown, parentId?: string): ChildNodeResult[] {
  const parsed = parseMcpToolContent(content);
  if (!parsed) return [];
  
  const nodesData = parsed.nodes ?? parsed.data ?? parsed.result ?? parsed;
  if (!Array.isArray(nodesData)) return [];
  
  return nodesData
    .filter(item => item && typeof item === 'object')
    .map(item => {
      const obj = item as Record<string, unknown>;
      return {
        id: String(obj.id || ''),
        name: String(obj.name || ''),
        type: String(obj.type || 'UNKNOWN'),
        parentId: parentId || (obj.parentId ? String(obj.parentId) : undefined),
      };
    })
    .filter(node => node.id && node.name);
}

function parseStylesFromContent(content: unknown, nameContains: string, styleType?: string): StyleResult[] {
  const parsed = parseMcpToolContent(content);
  if (!parsed) return [];
  
  const stylesData = parsed.styles ?? parsed.data ?? parsed.result ?? [];
  if (!Array.isArray(stylesData)) return [];
  
  const queryLower = nameContains.toLowerCase();
  
  return stylesData
    .filter(item => item && typeof item === 'object')
    .map(item => {
      const obj = item as Record<string, unknown>;
      return {
        id: String(obj.id || ''),
        name: String(obj.name || ''),
        styleType: String(obj.styleType || obj.type || 'UNKNOWN'),
        key: obj.key ? String(obj.key) : undefined,
      };
    })
    .filter(style => {
      if (!style.name.toLowerCase().includes(queryLower)) return false;
      if (styleType && style.styleType !== styleType) return false;
      return true;
    });
}
