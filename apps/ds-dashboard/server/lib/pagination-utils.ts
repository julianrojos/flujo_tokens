/**
 * Pagination Utilities
 * 
 * Pure utility functions for pagination and resource links.
 */

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

export interface ResourceLink {
  type: 'resource_link';
  id: string;
  name: string;
  resolvedType?: string;
}

export interface PaginationParams {
  limit: number;
  offset: number;
}

const DEFAULT_LIMIT = 500;
const MIN_LIMIT = 1;
const MAX_LIMIT = 500;
const DEFAULT_OFFSET = 0;

/**
 * Parse pagination parameters from request query/body
 * @param params - Record of query/body parameters
 * @returns Parsed and clamped pagination params
 */
export function parsePaginationParams(params: Record<string, unknown>): PaginationParams {
  const rawLimit = params.limit;
  const rawOffset = params.offset;

  // Parse limit
  let limit = DEFAULT_LIMIT;
  if (rawLimit !== undefined) {
    const parsed = typeof rawLimit === 'number' ? rawLimit : parseInt(String(rawLimit), 10);
    if (!isNaN(parsed)) {
      limit = Math.max(MIN_LIMIT, Math.min(MAX_LIMIT, parsed));
    }
  }

  // Parse offset
  let offset = DEFAULT_OFFSET;
  if (rawOffset !== undefined) {
    const parsed = typeof rawOffset === 'number' ? rawOffset : parseInt(String(rawOffset), 10);
    if (!isNaN(parsed)) {
      offset = Math.max(DEFAULT_OFFSET, parsed);
    }
  }

  return { limit, offset };
}

/**
 * Apply pagination to an array of items
 * @param items - Array of items to paginate
 * @param params - Pagination parameters (limit, offset)
 * @returns Paginated result with metadata
 */
export function applyPagination<T>(items: T[], params: PaginationParams): PaginatedResult<T> {
  const { limit, offset } = params;
  const total = items.length;

  const paginatedItems = items.slice(offset, offset + limit);
  const hasMore = offset + limit < total;

  return {
    items: paginatedItems,
    total,
    offset,
    limit,
    hasMore,
  };
}

/**
 * Convert variable data to lightweight resource links
 * @param variables - Array of variable objects
 * @returns Array of ResourceLink objects
 */
export function toResourceLinks<T extends { id: string; name: string; resolvedType?: string }>(
  variables: T[]
): ResourceLink[] {
  return variables.map((v) => ({
    type: 'resource_link' as const,
    id: v.id,
    name: v.name,
    resolvedType: v.resolvedType,
  }));
}
