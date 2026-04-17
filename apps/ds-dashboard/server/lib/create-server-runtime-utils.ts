/**
 * Create Server Runtime Utils
 *
 * Utilities for server runtime.
 * Migrated from apps/ds-dashboard/server/lib/create-server-runtime-utils.mjs
 */
import { createHash } from 'node:crypto';

export interface Env {
  NODE_ENV?: string;
  [key: string]: string | undefined;
}

export interface DesignSystemRepository {
  resolveDashboardSystemContext: (
    systemHeader: string,
  ) => Promise<{ systemId: string; [key: string]: unknown }>;
}

/**
 * Create a function to check if running in development mode.
 */
export function createDevRuntimeChecker(env: Env = process.env): () => boolean {
  return function isDevRuntime(): boolean {
    return env.NODE_ENV === 'development';
  };
}

/**
 * Create a SHA-256 text hasher function.
 */
export function createSha256TextHasher(): (value: string) => string {
  return function sha256Text(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  };
}

/**
 * Create a system context resolver function.
 */
export function createSystemContextResolver(
  designSystemRepository: DesignSystemRepository,
): (
  systemHeader: string,
) => Promise<{ systemId: string; header: string }> {
  return async function getSystemContext(
    systemHeader: string,
  ): Promise<{ systemId: string; header: string }> {
    const context =
      await designSystemRepository.resolveDashboardSystemContext(systemHeader);
    return {
      header: systemHeader,
      ...context,
    };
  };
}
