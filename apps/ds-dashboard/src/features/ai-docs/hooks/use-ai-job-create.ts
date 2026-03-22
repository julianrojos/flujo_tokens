/**
 * useAiJobCreate Hook
 * Mutation hook for creating AI documentation jobs
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createAiJob } from '../lib/ai-jobs-api';
import type { AiProviderName, CreateAiJobRequest } from '@/types/ai-jobs';

export interface UseAiJobCreateOptions {
    onSuccess?: (jobId: string) => void;
    onError?: (error: Error) => void;
}

export interface UseAiJobCreateInput {
    provider: AiProviderName;
    componentId: string;
    model?: string;
    figmaUrl?: string;
    dryRun?: boolean;
}

export function useAiJobCreate(options?: UseAiJobCreateOptions) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (input: UseAiJobCreateInput): Promise<string> => {
            const request: CreateAiJobRequest = {
                type: 'GENERATE_COMPONENT_DOC',
                provider: input.provider,
                componentId: input.componentId,
                model: input.model,
                figmaUrl: input.figmaUrl,
                dryRun: input.dryRun,
            };

            const response = await createAiJob(request);

            if (!response.ok) {
                throw new Error('Failed to create job');
            }

            return response.jobId;
        },
        onSuccess: (jobId) => {
            // Invalidate any job list queries
            queryClient.invalidateQueries({ queryKey: ['ai-jobs'] });
            options?.onSuccess?.(jobId);
        },
        onError: (error) => {
            options?.onError?.(error as Error);
        },
    });
}
