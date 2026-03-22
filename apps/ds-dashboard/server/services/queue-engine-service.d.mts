export function createQueueEngineService(args: unknown): {
  queueJobs: Map<string, unknown>;
  queueMetrics: () => Record<string, number>;
  cancelQueueJob: (...args: unknown[]) => { ok: boolean };
  enqueueQueueJob: (...args: unknown[]) => { id: string };
};
