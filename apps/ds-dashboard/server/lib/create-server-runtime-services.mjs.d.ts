export declare function createServerRuntimeServices(config: unknown): {
    queueMetrics: unknown;
    nowIso: unknown;
    createApiRequestId: unknown;
    buildApiErrorPayload: (...args: unknown[]) => Record<string, unknown>;
    writeStructuredLog: (level: string, payload: Record<string, unknown>) => void;
};
