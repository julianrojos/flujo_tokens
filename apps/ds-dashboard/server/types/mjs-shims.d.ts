/**
 * TypeScript declarations for .mjs modules
 * Resolves TS7016 errors for untracked .mjs files
 */

declare module 'analysis-artifacts-service' {
  export function computeNamingDebtReport(args: unknown): unknown;
  export function validateGitRef(...args: unknown[]): unknown;
}

declare module 'create-server-app-route-deps' {
  export function buildCreateServerAppRouteDeps(config: unknown): unknown;
}

declare module 'create-server-runtime-services' {
  export function createServerRuntimeServices(args: unknown): unknown;
}
