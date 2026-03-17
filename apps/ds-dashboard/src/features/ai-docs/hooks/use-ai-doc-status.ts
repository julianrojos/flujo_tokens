/**
 * useAiDocStatus Hook
 * Query hook for fetching documentation staleness status
 */

import { useQuery } from '@tanstack/react-query';
import { getAiDocStatus } from '../lib/ai-jobs-api';
import type { AiDocStatusResponse } from '@/types/ai-jobs';

const STALENESS_STALE_TIME = 60_000; // 1 minute

export interface UseAiDocStatusResult {
    data: AiDocStatusResponse | undefined;
    isLoading: boolean;
    error: Error | null;
}

export function useAiDocStatus(): UseAiDocStatusResult {
    const query = useQuery({
        queryKey: ['ai-doc-status'],
        queryFn: async () => {
            return getAiDocStatus();
        },
        staleTime: STALENESS_STALE_TIME,
        refetchInterval: STALENESS_STALE_TIME,
    });

    return {
        data: query.data,
        isLoading: query.isLoading,
        error: query.error as Error | null,
    };
}
