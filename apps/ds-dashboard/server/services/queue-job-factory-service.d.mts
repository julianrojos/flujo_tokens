export function createQueueJobFactoryService(args: unknown): {
  queueNpmScript: (...args: unknown[]) => { id: string };
  queueNodeJsonCommand: (...args: unknown[]) => { id: string };
  enqueueRefreshNamingDebtJob: (...args: unknown[]) => { id: string };
  enqueueReplayJobFromOperation: (...args: unknown[]) => { id: string };
};
