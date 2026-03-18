export function createCommandExecutionService(args: unknown): {
  runQueuedSpawnCommand: (...args: unknown[]) => Promise<{ ok: boolean }>;
};
