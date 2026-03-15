/**
 * useAiJobStatus Hook
 * Query hook for polling job status
 */

import { useQuery } from '@tanstack/react-query';
import { getAiJob } from '../lib/ai-jobs-api';
import type { AiJobResponse, AiJobStatus } from '@/types/ai-jobs';

const TERMINAL_STATUSES: AiJobStatus[] = ['completed', 'failed', 'cancelled'];

function isTerminalStatus(status: AiJobStatus): boolean {
    return TERMINAL_STATUSES.includes(status);
}

/**
 * Polling interval in milliseconds
 */
const POLLING_INTERVAL = 2000;

export interface UseAiJobStatusOptions {
    /** Job ID to fetch */
    jobId: string | null;
    /** Whether to enable the query at all */
    enabled?: boolean;
    /** Whether periodic polling is enabled (SSE should be primary when false) */
    pollingEnabled?: boolean;
}

export interface UseAiJobStatusResult {
    /** Job data */
    job: AiJobResponse | undefined;
    /** Whether the query is loading */
    isLoading: boolean;
    /** Whether there was an error */
    error: Error | null;
    /** Whether the job is in a terminal state */
    isDone: boolean;
    /** Whether polling is active */
    isPolling: boolean;
}

export function useAiJobStatus({
    jobId,
    enabled = true,
    pollingEnabled = true,
}: UseAiJobStatusOptions): UseAiJobStatusResult {
    const query = useQuery({
        queryKey: ['ai-job', jobId],
        queryFn: async (): Promise<AiJobResponse> => {
            if (!jobId) {
                throw new Error('Job ID is required');
            }
            return getAiJob(jobId);
        },
        enabled: enabled && !!jobId,
        // Poll when not in terminal state
        refetchInterval: (query) => {
            if (!pollingEnabled) {
                return false;
            }
            const data = query.state.data;
            if (!data || isTerminalStatus(data.status)) {
                return false;
            }
            return POLLING_INTERVAL;
        },
        // Don't retry too aggressively
        retry: 2,
        // Retry delay
        retryDelay: 1000,
    });

    return {
        job: query.data,
        isLoading: query.isLoading,
        error: query.error as Error | null,
        isDone: query.data ? isTerminalStatus(query.data.status) : false,
        isPolling: pollingEnabled && query.isFetching && !query.isLoading,
    };
}
