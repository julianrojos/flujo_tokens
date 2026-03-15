/**
 * useAiJobDiff Hook
 * Query hook for fetching job diff
 */

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getAiJobDiff } from '../lib/ai-jobs-api';

export interface UseAiJobDiffOptions {
    /** Job ID to fetch diff for */
    jobId: string | null;
    /** Whether the job is completed */
    enabled?: boolean;
}

export function useAiJobDiff({ jobId, enabled = true }: UseAiJobDiffOptions) {
    const queryClient = useQueryClient();

    const query = useQuery({
        queryKey: ['ai-job-diff', jobId],
        queryFn: async () => {
            if (!jobId) {
                throw new Error('Job ID is required');
            }
            return getAiJobDiff(jobId);
        },
        enabled: enabled && !!jobId,
    });

    const invalidateDiff = useCallback(() => {
        if (jobId) {
            queryClient.invalidateQueries({ queryKey: ['ai-job-diff', jobId] });
        }
    }, [jobId, queryClient]);

    return {
        diff: query.data,
        isLoading: query.isLoading,
        error: query.error as Error | null,
        invalidateDiff,
    };
}
