/**
 * Server Meta Information
 * 
 * Centralizes schema version and capabilities for API responses.
 */

export const SCHEMA_VERSION = '1.0.0';

/**
 * Active capabilities for P0a implementation:
 * - pagination: support for limit/offset pagination
 * - cache: in-memory response caching with TTL
 * - schema_version: meta field with schema version
 */
export const ACTIVE_CAPABILITIES: readonly string[] = [
  'pagination',
  'cache',
  'schema_version',
] as const;

export interface ServerMeta {
  schemaVersion: string;
  capabilities: readonly string[];
}

/**
 * Build server meta object for inclusion in API responses
 */
export function buildServerMeta(): ServerMeta {
  return {
    schemaVersion: SCHEMA_VERSION,
    capabilities: ACTIVE_CAPABILITIES,
  };
}
