/**
 * TypeScript declarations for .mjs modules
 * Resolves TS7016 errors for untracked .mjs files
 */

declare module 'analysis-artifacts-service' {
  export function computeNamingDebtReport(args: unknown): unknown;
  export function validateGitRef(...args: unknown[]): unknown;
}

declare module 'command-execution-service' {
  export function createCommandExecutionService(args: unknown): unknown;
}

declare module 'operation-history-service' {
  export function createOperationHistoryService(args: unknown): unknown;
}

declare module 'queue-engine-service' {
  export function createQueueEngineService(args: unknown): unknown;
}

declare module 'queue-job-factory-service' {
  export function createQueueJobFactoryService(args: unknown): unknown;
}

declare module 'spawn-runner' {
  export function runSpawnWithCapture(options: unknown): Promise<unknown>;
}

declare module 'create-server-app-route-deps' {
  export function buildCreateServerAppRouteDeps(config: unknown): unknown;
}

declare module 'create-server-runtime-services' {
  export function createServerRuntimeServices(args: unknown): unknown;
}
