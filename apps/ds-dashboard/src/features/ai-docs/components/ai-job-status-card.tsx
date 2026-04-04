/**
 * AiJobStatusCard Component
 * Shows job status, events timeline, preview, and action buttons
 */

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal, ModalContent, ModalHeader } from '@/components/ui/overlay';
import { StatusAlert } from '@/components/ui/status-alert';
import { useAiJobStatus } from '../hooks/use-ai-job-status';
import { cancelAiJob } from '../lib/ai-jobs-api';
import { AiDocPreview, formatJobEvent, formatRelativeTime } from './ai-doc-preview';
import type { AiJobStatus, AiJobResponse, AiJobInput } from '@/types/ai-jobs';

interface AiJobStatusCardProps {
    /** Job ID to display */
    jobId: string;
    /** Callback when job status changes */
    onStatusChange?: (status: AiJobStatus) => void;
    /** Callback when apply is requested */
    onApply?: (jobId: string) => void;
    /** Whether to show streaming indicator (for SSE) */
    isStreaming?: boolean;
    /** External events to display (from SSE) */
    externalEvents?: AiJobResponse['events'];
    /** Callback to retry a failed job with the same parameters */
    onRetry?: (input: AiJobInput) => void;
    /** Enable status polling (set false when SSE is healthy to keep SSE primary) */
    enablePolling?: boolean;
}

const STATUS_CONFIG: Record<AiJobStatus, { variant: 'default' | 'success' | 'warning' | 'neutral'; label: string }> = {
    pending: { variant: 'neutral', label: 'Pending' },
    queued: { variant: 'neutral', label: 'Queued' },
    running: { variant: 'default', label: 'Running' },
    completed: { variant: 'success', label: 'Completed' },
    failed: { variant: 'warning', label: 'Failed' },
    cancelled: { variant: 'neutral', label: 'Cancelled' },
};

export function AiJobStatusCard({
    jobId,
    onStatusChange,
    onApply,
    onRetry,
    isStreaming = false,
    externalEvents = [],
    enablePolling = true,
}: AiJobStatusCardProps) {
    const { job, isLoading, error } = useAiJobStatus({
        jobId,
        pollingEnabled: enablePolling,
    });
    const [showPreview, setShowPreview] = useState(false);
    const [isCancelling, setIsCancelling] = useState(false);

    // Merge external events (SSE) with job events (polling), deduplicated by seq
    // SSE events take precedence as they are the source of truth for live streaming
    const events = useMemo(() => {
        const jobEvents = job?.events ?? [];
        if (externalEvents.length === 0) return jobEvents;
        if (jobEvents.length === 0) return externalEvents;

        // Merge both arrays, preferring external events for same seq
        const eventMap = new Map<number, AiJobResponse['events'][number]>();
        for (const evt of jobEvents) {
            eventMap.set(evt.seq, evt);
        }
        for (const evt of externalEvents) {
            eventMap.set(evt.seq, evt); // External overrides
        }
        return Array.from(eventMap.values()).sort((a, b) => a.seq - b.seq);
    }, [externalEvents, job?.events]);

    const handleCancel = async () => {
        if (!jobId) return;
        setIsCancelling(true);
        try {
            await cancelAiJob(jobId);
        } catch (err) {
            console.error('Failed to cancel job:', err);
        } finally {
            setIsCancelling(false);
        }
    };

    const handleApply = async () => {
        if (!jobId || !job?.output) return;
        onApply?.(jobId);
    };

    // Notify parent of status changes in useEffect (not during render)
    useEffect(() => {
        if (job && onStatusChange) {
            onStatusChange(job.status);
        }
    }, [job?.status, onStatusChange]);

    useEffect(() => {
        setShowPreview(false);
    }, [jobId]);

    if (isLoading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Loading job...</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">Fetching job status</p>
                </CardContent>
            </Card>
        );
    }

    if (error) {
        return (
            <StatusAlert
                variant="error"
                title="Unable to load job status"
                description={error.message}
            />
        );
    }

    if (!job) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Job not found</CardTitle>
                    <CardDescription>No job found with ID: {jobId}</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    const statusConfig = STATUS_CONFIG[job.status];
    const canCancel = job.status === 'queued' || job.status === 'running';
    const canApply = job.status === 'completed' && job.output;
    const canRetry = job.status === 'failed' && job.retryable;

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            {job.input.componentId}
                            {isStreaming && (
                                <Badge variant="default" className="animate-pulse">
                                    ⚡ Live
                                </Badge>
                            )}
                        </CardTitle>
                        <CardDescription>
                            {job.input.provider} • {job.input.model || 'default model'}
                        </CardDescription>
                    </div>
                    <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
                </div>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* Error display */}
                {job.status === 'failed' && job.error && (
                    <StatusAlert
                        variant="error"
                        title={job.errorCode ? `[${job.errorCode}] Job failed` : 'Job failed'}
                        description={
                            job.retryable
                                ? `${job.error} This error is retryable.`
                                : job.error
                        }
                    />
                )}

                {/* Usage metrics */}
                {job.status === 'completed' && job.usage && (
                    <div className="flex gap-4 text-sm text-muted-foreground">
                        <span>Prompt: {job.usage.promptTokens} tokens</span>
                        <span>Completion: {job.usage.completionTokens} tokens</span>
                        <span>Duration: {Math.round(job.usage.durationMs / 1000)}s</span>
                    </div>
                )}

                {/* Events timeline */}
                {events.length > 0 && (
                    <div className="space-y-2">
                        <h4 className="text-sm font-medium">Timeline</h4>
                        <div className="max-h-48 overflow-y-auto space-y-1 text-sm border rounded-md p-2">
                            {events.map((evt, idx) => (
                                <div key={idx} className="flex gap-2 text-xs">
                                    <span className="text-muted-foreground shrink-0">
                                        {formatRelativeTime(evt.ts)}
                                    </span>
                                    <span className="text-foreground">
                                        {formatJobEvent(evt)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Preview toggle */}
                {job.status === 'completed' && job.output?.markdown && (
                    <div className="space-y-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowPreview(true)}
                        >
                            Show Preview
                        </Button>
                    </div>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                    {canCancel && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleCancel}
                            disabled={isCancelling}
                        >
                            {isCancelling ? 'Cancelling...' : 'Cancel'}
                        </Button>
                    )}

                    {canRetry && onRetry && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onRetry(job.input)}
                        >
                            Retry
                        </Button>
                    )}

                    {canApply && (
                        <Button
                            size="sm"
                            onClick={handleApply}
                        >
                            Apply
                        </Button>
                    )}
                </div>
            </CardContent>

            {job.status === 'completed' && job.output?.markdown ? (
                <Modal
                    open={showPreview}
                    onClose={() => setShowPreview(false)}
                    aria-labelledby="ai-doc-preview-modal-title"
                    zIndex={1200}
                >
                    <ModalContent size="lg" className="flex max-h-[85vh] flex-col overflow-hidden">
                        <ModalHeader>
                            <div>
                                <h3 id="ai-doc-preview-modal-title" className="text-lg font-semibold">
                                    Documentation Preview
                                </h3>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Generated markdown preview for this job.
                                </p>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowPreview(false)}
                            >
                                Close
                            </Button>
                        </ModalHeader>
                        <div className="min-h-0 flex-1 overflow-y-auto p-5">
                            <AiDocPreview markdown={job.output.markdown} />
                        </div>
                    </ModalContent>
                </Modal>
            ) : null}
        </Card>
    );
}
