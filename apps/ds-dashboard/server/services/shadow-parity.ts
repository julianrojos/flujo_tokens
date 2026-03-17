/**
 * Shadow Mode Helper
 *
 * Provides isolated shadow execution for parity checking between
 * direct and legacy modes without blocking the primary response.
 *
 * Phase 4: Shadow mode with isolation
 */

/**
 * Configuration for shadow mode
 */
export interface ShadowModeConfig {
    /** Maximum time to wait for legacy result */
    legacyTimeoutMs?: number;
    /** Maximum concurrent shadow operations per endpoint+fileKey */
    maxConcurrency?: number;
    /** Callback when parity diff is detected */
    onParityDiff?: (diff: ParityDiff) => void;
}

/**
 * Result of parity comparison
 */
export interface ParityDiff {
    endpoint: string;
    directResult: unknown;
    legacyResult: unknown;
    differences: Array<{
        path: string;
        directValue: unknown;
        legacyValue: unknown;
    }>;
    timestamp: number;
}

/**
 * Shadow mode executor with concurrency limiting
 */
export class ShadowModeExecutor {
    private legacyTimeoutMs: number;
    private maxConcurrency: number;
    private onParityDiff?: (diff: ParityDiff) => void;
    private runningOperations: Map<string, number> = new Map();

    constructor(config: ShadowModeConfig = {}) {
        this.legacyTimeoutMs = config.legacyTimeoutMs ?? 10_000; // 10s default
        this.maxConcurrency = config.maxConcurrency ?? 1; // 1 per endpoint+fileKey
        this.onParityDiff = config.onParityDiff;
    }

    /**
     * Run a shadow operation with concurrency limiting.
     * Fire-and-forget: returns immediately, executes in background.
     */
    runShadow<T extends string>(
        endpoint: T,
        fileKey: string | null,
        directFn: () => Promise<unknown>,
        legacyFn: () => Promise<unknown>
    ): void {
        const key = `${endpoint}:${fileKey ?? 'null'}`;

        // Check concurrency limit
        const currentCount = this.runningOperations.get(key) ?? 0;
        if (currentCount >= this.maxConcurrency) {
            console.log(`[ShadowMode] Skipping ${key}: concurrency limit reached`);
            return;
        }

        // Increment counter
        this.runningOperations.set(key, currentCount + 1);

        // Execute shadow operation - fire and forget with proper cleanup in finally
        void this.executeShadow(key, directFn, legacyFn)
            .catch((e) => console.warn({ key, error: e }, '[ShadowMode] shadow failed'))
            .finally(() => {
                const next = (this.runningOperations.get(key) ?? 1) - 1;
                if (next <= 0) this.runningOperations.delete(key);
                else this.runningOperations.set(key, next);
            });
    }

    /**
     * Execute shadow operation and compare results
     */
    private async executeShadow(
        key: string,
        directFn: () => Promise<unknown>,
        legacyFn: () => Promise<unknown>
    ): Promise<void> {
        let directResult: unknown;
        let legacyResult: unknown;

        try {
            directResult = await directFn();
        } catch (error) {
            console.error(`[ShadowMode] Direct call failed for ${key}:`, error);
            return;
        }

        // Execute legacy with timeout
        try {
            legacyResult = await this.withTimeout(legacyFn(), this.legacyTimeoutMs);
        } catch (error) {
            console.warn(`[ShadowMode] Legacy call failed or timed out for ${key}:`, error);
            return;
        }

        // Compare results
        const diff = this.compareResults(key, directResult, legacyResult);
        if (diff.differences.length > 0) {
            console.warn(`[ShadowMode] Parity mismatch for ${key}:`, diff.differences);
            this.onParityDiff?.(diff);
        } else {
            console.log(`[ShadowMode] Parity OK for ${key}`);
        }
    }

    /**
     * Execute function with timeout
     */
    private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
        let timeoutId: ReturnType<typeof setTimeout> | undefined;

        const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => {
                reject(new Error(`Shadow timeout after ${timeoutMs}ms`));
            }, timeoutMs);
        });

        try {
            return await Promise.race([promise, timeoutPromise]);
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
        }
    }

    /**
     * Volatile fields to exclude from comparison (timestamps, elapsed times, etc.)
     */
    private static VOLATILE_FIELDS = new Set([
        'elapsedMs',
        'timestamp',
        'durationMs',
        'startedAt',
        'finishedAt',
        'requestId',
        '_transport',
    ]);

    /**
     * Check if a field should be excluded from comparison
     */
    private isVolatileField(path: string): boolean {
        const fieldName = path.split('.').pop() ?? '';
        return ShadowModeExecutor.VOLATILE_FIELDS.has(fieldName);
    }

    /**
     * Compare direct and legacy results
     */
    private compareResults(endpoint: string, direct: unknown, legacy: unknown): ParityDiff {
        const differences: ParityDiff['differences'] = [];

        // Compare basic structure (excluding volatile fields)
        this.compareValues(direct, legacy, '', differences);

        return {
            endpoint,
            directResult: direct,
            legacyResult: legacy,
            differences,
            timestamp: Date.now(),
        };
    }

    /**
     * Recursively compare values
     */
    private compareValues(
        direct: unknown,
        legacy: unknown,
        path: string,
        differences: Array<{ path: string; directValue: unknown; legacyValue: unknown }>
    ): void {
        // Handle null/undefined
        if (direct === null || direct === undefined) {
            if (legacy !== null && legacy !== undefined) {
                differences.push({ path, directValue: direct, legacyValue: legacy });
            }
            return;
        }

        if (legacy === null || legacy === undefined) {
            differences.push({ path, directValue: direct, legacyValue: legacy });
            return;
        }

        // Skip volatile fields
        if (this.isVolatileField(path)) {
            return;
        }

        // Check for type mismatch (array vs object vs primitive)
        const directIsArray = Array.isArray(direct);
        const legacyIsArray = Array.isArray(legacy);
        if (directIsArray !== legacyIsArray) {
            differences.push({
                path,
                directValue: direct,
                legacyValue: legacy,
            });
            return;
        }

        // Handle arrays
        if (directIsArray && legacyIsArray) {
            if (direct.length !== legacy.length) {
                differences.push({ path: `${path}.length`, directValue: direct.length, legacyValue: legacy.length });
            }
            // Compare elements
            const maxLen = Math.max(direct.length, legacy.length);
            for (let i = 0; i < maxLen; i++) {
                this.compareValues(direct[i], legacy[i], `${path}[${i}]`, differences);
            }
            return;
        }

        // Handle objects
        if (typeof direct === 'object' && typeof legacy === 'object') {
            const directKeys = new Set(Object.keys(direct as object));
            const legacyKeys = new Set(Object.keys(legacy as object));

            // Check for missing keys
            for (const key of directKeys) {
                if (!legacyKeys.has(key)) {
                    differences.push({ path: `${path}.${key}`, directValue: (direct as Record<string, unknown>)[key], legacyValue: undefined });
                }
            }

            for (const key of legacyKeys) {
                if (!directKeys.has(key)) {
                    differences.push({ path: `${path}.${key}`, directValue: undefined, legacyValue: (legacy as Record<string, unknown>)[key] });
                }
            }

            // Compare common keys
            for (const key of directKeys) {
                if (legacyKeys.has(key)) {
                    this.compareValues(
                        (direct as Record<string, unknown>)[key],
                        (legacy as Record<string, unknown>)[key],
                        `${path}.${key}`,
                        differences
                    );
                }
            }
            return;
        }

        // Primitive comparison
        if (direct !== legacy) {
            differences.push({ path, directValue: direct, legacyValue: legacy });
        }
    }

    /**
     * Get debug info
     */
    getDebugInfo(): {
        runningOperations: Array<{ key: string; count: number }>;
    } {
        return {
            runningOperations: Array.from(this.runningOperations.entries()).map(([key, count]) => ({ key, count })),
        };
    }
}

// Singleton instance
let _shadowModeExecutor: ShadowModeExecutor | null = null;

/**
 * Get or create the singleton ShadowModeExecutor
 */
export function getShadowModeExecutor(config?: ShadowModeConfig): ShadowModeExecutor {
    if (!_shadowModeExecutor) {
        _shadowModeExecutor = new ShadowModeExecutor(config);
    }
    return _shadowModeExecutor;
}

/**
 * Reset the singleton (for testing)
 */
export function resetShadowModeExecutor(): void {
    _shadowModeExecutor = null;
}
