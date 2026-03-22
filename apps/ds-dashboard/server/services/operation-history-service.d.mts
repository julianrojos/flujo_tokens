export function createOperationHistoryService(args: unknown): {
  appendOperationEventSafe: (...args: unknown[]) => void;
  toFiniteTimestamp: (...args: unknown[]) => number;
  readOperationHistory: (...args: unknown[]) => unknown;
  findOperationEventById: (...args: unknown[]) => unknown;
  buildOperationRegressionsReport: (...args: unknown[]) => unknown;
};
