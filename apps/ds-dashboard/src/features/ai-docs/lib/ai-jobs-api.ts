/**
 * AI Jobs API Client
 * Typed API client for AI-powered component documentation endpoints
 */

import { requestJson } from '@/lib/api';
import { buildAiJobEventsUrl } from '@/types/ai-jobs';
import type {
    AiJobResponse,
    CreateAiJobRequest,
    CreateAiJobResponse,
    ApplyAiJobRequest,
    ApplyAiJobResponse,
    AiDocStatusResponse,
    DiffResult,
} from '@/types/ai-jobs';

/**
 * Create a new AI documentation job
 */
export async function createAiJob(params: CreateAiJobRequest): Promise<CreateAiJobResponse> {
    return requestJson<CreateAiJobResponse>('/api/ai/jobs', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
    });
}

/**
 * Get job status and details
 */
export async function getAiJob(jobId: string): Promise<AiJobResponse> {
    return requestJson<AiJobResponse>(`/api/ai/jobs/${jobId}`);
}

/**
 * Apply generated documentation (write to file)
 */
export async function applyAiJob(jobId: string, opts: ApplyAiJobRequest = {}): Promise<ApplyAiJobResponse> {
    return requestJson<ApplyAiJobResponse>(`/api/ai/jobs/${jobId}/apply`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(opts),
    });
}

/**
 * Cancel a queued or running job
 */
export async function cancelAiJob(jobId: string): Promise<{ ok: boolean }> {
    return requestJson<{ ok: boolean }>(`/api/ai/jobs/${jobId}/cancel`, {
        method: 'POST',
    });
}

/**
 * Get documentation staleness status for all components
 */
export async function getAiDocStatus(): Promise<AiDocStatusResponse> {
    return requestJson<AiDocStatusResponse>('/api/ai/docs/status');
}

/**
 * Get diff between generated doc and existing doc
 */
export async function getAiJobDiff(jobId: string): Promise<DiffResult> {
    return requestJson<DiffResult>(`/api/ai/jobs/${jobId}/diff`);
}

/**
 * Build SSE URL for job events (exported for use in hooks)
 */
export { buildAiJobEventsUrl };
