/**
 * AiJobStatusCard Component
 * Shows job status, events timeline, preview, and action buttons
 */

import { useState, useMemo, useEffect, useRef, useId } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal, ModalContent, ModalHeader, ModalCloseButton } from '@/components/ui/overlay';
import { MarkdownViewer } from '@/components/ui/markdown-viewer';
import { StatusAlert } from '@/components/ui/status-alert';
import { ApiErrorMessage } from '@/components/api-error-message';
import { useAiJobStatus } from '@/hooks/use-ai-job-status';
import { useJobProgress } from '@/hooks/use-job-progress';
import { cancelAiJob } from '@/lib/ai-jobs-api';
import { toApiErrorDisplay } from '@/lib/api-error-ux';
import { formatRelativeTime } from '@/lib/format-relative-time';
import type { AiJobStatus, AiJobResponse, AiJobInput, AiSuggestionPayload, ValidationReport, ValidationSeverity } from '@/types/ai-jobs';

interface AiJobStatusCardProps {
    /** Job ID to display */
    jobId: string;
    /** Callback when job status changes */
    onStatusChange?: (status: AiJobStatus) => void;
    /** Callback when apply is requested */
    onApply?: (jobId: string) => void;
    /** Called once when job completes with output. Use useRef guard to prevent duplicates. */
    onJobComplete?: (suggestion: AiSuggestionPayload) => void;
    /** Whether to show streaming indicator (for SSE) */
    isStreaming?: boolean;
    /** External events to display (from SSE) */
    externalEvents?: AiJobResponse['events'];
    /** Callback to retry a failed job with the same parameters */
    onRetry?: (input: AiJobInput) => void;
    /** Enable status polling (set false when SSE is healthy to keep SSE primary) */
    enablePolling?: boolean;
    /** Optional catalog map to resolve component name by Figma componentId */
    componentNamesById?: Record<string, string>;
    /** Hide header (title/provider/status badge) for compact embedded contexts */
    hideHeader?: boolean;
    /** Hide "Show Preview" action button while preserving preview modal support elsewhere */
    hidePreviewButton?: boolean;
    /** Optional wrapper className for the root card */
    className?: string;
}

const STATUS_CONFIG: Record<AiJobStatus, { variant: 'default' | 'success' | 'warning' | 'neutral'; label: string }> = {
    pending: { variant: 'neutral', label: 'Pending' },
    queued: { variant: 'neutral', label: 'Queued' },
    running: { variant: 'default', label: 'Running' },
    completed: { variant: 'success', label: 'Completed' },
    failed: { variant: 'warning', label: 'Failed' },
    cancelled: { variant: 'neutral', label: 'Cancelled' },
};

function formatJobEvent(event: { event: string; ts: number; data?: unknown }): string {
    const eventName = event.event
        .replace(/[._]/g, ' ')
        .replace(/([A-Z])/g, ' $1')
        .trim();
    if (event.data) {
        const dataStr = typeof event.data === 'string' ? event.data : JSON.stringify(event.data);
        return `${eventName}: ${dataStr}`;
    }
    return eventName;
}

function AiDocPreview({ markdown, className }: { markdown: string; className?: string }) {
    if (!markdown) {
        return <div className="p-4 text-sm text-muted-foreground">No documentation generated yet.</div>;
    }
    const markdownWithoutFrontmatter = markdown.replace(/^---[\s\S]*?---\n?/, '');
    return <MarkdownViewer content={markdownWithoutFrontmatter} className={className} />;
}

function JobProgressBar({ percent, label }: { percent: number; label: string }) {
    const clampedPercent = Math.min(100, Math.max(0, percent));
    const labelId = useId();

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
                <span id={labelId} className="text-muted-foreground">{label}</span>
                <span className="font-medium tabular-nums">{clampedPercent}%</span>
            </div>
            <div
                role="progressbar"
                aria-labelledby={labelId}
                aria-valuetext={`${clampedPercent}%`}
                aria-valuenow={clampedPercent}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-2 w-full overflow-hidden rounded-full bg-muted"
            >
                <div
                    className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
                    style={{ width: `${clampedPercent}%` }}
                />
            </div>
        </div>
    );
}

const severityBadgeVariant: Record<ValidationSeverity, 'error' | 'warning' | 'neutral'> = {
    blocking: 'error',
    warning: 'warning',
    info: 'neutral',
};

function scoreColor(score: number): string {
    if (score >= 80) return 'text-status-success';
    if (score >= 50) return 'text-status-warning';
    return 'text-status-error';
}

function ValidationSectionList({ title, severity, items }: { title: string; severity: ValidationSeverity; items: string[] }) {
    const borderColors: Record<ValidationSeverity, string> = {
        blocking: 'border-l-status-error-border',
        warning: 'border-l-status-warning-border',
        info: 'border-l-status-success-border',
    };

    return (
        <div className={`mb-2 border-l-4 ${borderColors[severity]} pl-3`}>
            <h4 className="text-sm font-titles font-semibold titles-color">{title}</h4>
            <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
                {items.slice(0, 5).map((item, i) => (
                    <li key={i}>{item}</li>
                ))}
                {items.length > 5 && <li className="text-muted-foreground/70">+{items.length - 5} more</li>}
            </ul>
        </div>
    );
}

function ValidationReportPanel({
    report,
    canPublish,
    jobStatus,
    pipelineStage,
    showFailOpenNotice = false,
}: {
    report: ValidationReport | undefined;
    canPublish: boolean | undefined;
    jobStatus?: string;
    pipelineStage?: 'extracting' | 'patching' | 'validating' | null;
    showFailOpenNotice?: boolean;
}) {
    if (!report) {
        if (jobStatus !== 'completed' || pipelineStage) return null;
        if (showFailOpenNotice) {
            return (
                <div className="rounded border border-border bg-muted/30 p-4">
                    <p className="text-sm text-muted-foreground">Validation not available (fail-open).</p>
                </div>
            );
        }
        if (canPublish !== false) return null;
        return (
            <div className="rounded border border-border bg-muted/30 p-4">
                <p className="text-sm text-muted-foreground">Validation report not available.</p>
            </div>
        );
    }

    const severityLabel = report.severity === 'blocking'
        ? 'Blocking'
        : report.severity === 'warning'
            ? 'Warning'
            : 'Info';

    return (
        <div className="rounded border border-border bg-background p-4">
            <div className="mb-3 flex items-center gap-3">
                <h3 className="text-base font-titles font-semibold titles-color">Quality Assessment</h3>
                <Badge variant={severityBadgeVariant[report.severity]}>{severityLabel}</Badge>
                <span className={`text-lg font-bold ${scoreColor(report.score)}`}>{report.score}/100</span>
                {!canPublish && <Badge variant="error">Cannot publish</Badge>}
            </div>

            {report.structureWarnings.length > 0 && (
                <ValidationSectionList title="Structure Warnings" severity="warning" items={report.structureWarnings.map((w) => w.message)} />
            )}
            {report.missingSections.length > 0 && (
                <ValidationSectionList title="Missing Sections" severity="warning" items={report.missingSections.map((s) => `${s.section}: ${s.reason}`)} />
            )}
            {report.unsupportedClaims.length > 0 && (
                <ValidationSectionList title="Unsupported Claims" severity="warning" items={report.unsupportedClaims.map((c) => c.claim)} />
            )}
            {report.editorialConflicts.length > 0 && (
                <ValidationSectionList title="Editorial Conflicts" severity="blocking" items={report.editorialConflicts.map((c) => `${c.extraction} vs ${c.editorial}`)} />
            )}
            {report.terminologyMismatches.length > 0 && (
                <ValidationSectionList title="Terminology Mismatches" severity="info" items={report.terminologyMismatches.map((t) => `Used "${t.used}", expected "${t.expected}"`)} />
            )}
            {report.a11yWarnings.length > 0 && (
                <ValidationSectionList title="Accessibility Warnings" severity="warning" items={report.a11yWarnings.map((a) => a.message)} />
            )}
            {report.notes.length > 0 && (
                <div className="mt-2 text-xs text-muted-foreground">
                    {report.notes.map((note, i) => <p key={i}>{note}</p>)}
                </div>
            )}
        </div>
    );
}

export function AiJobStatusCard({
    jobId,
    onStatusChange,
    onApply,
    onJobComplete,
    onRetry,
    isStreaming = false,
    externalEvents = [],
    enablePolling = true,
    componentNamesById,
    hideHeader = false,
    hidePreviewButton = false,
    className,
}: AiJobStatusCardProps) {
    const { job, isLoading, error } = useAiJobStatus({
        jobId,
        pollingEnabled: enablePolling,
    });
    const [showPreview, setShowPreview] = useState(false);
    const [isCancelling, setIsCancelling] = useState(false);
    const [cancelError, setCancelError] = useState<string | null>(null);
    const resolvedPreviewMarkdown = job?.previewMarkdown ?? job?.output?.markdown;
    const hasCompleteOutputForSuggestions = Boolean(
        job?.output
        && typeof job.output.summary === 'string'
        && Array.isArray(job.output.variants),
    );
    const hasMeaningfulSuggestionContent = Boolean(
        (
            job?.output
            && typeof job.output.summary === 'string'
            && (
                job.output.summary.trim().length > 0
                || job.output.variants.length > 0
            )
        )
        || (
            job?.editorialPatch
            && (
                Boolean(job.editorialPatch.summary?.purpose?.trim())
                || Boolean(job.editorialPatch.summary?.when_to_use?.trim())
                || Boolean(job.editorialPatch.summary?.when_not_to_use?.trim())
                || (job.editorialPatch.content_guidelines?.rules?.length ?? 0) > 0
                || Boolean(job.editorialPatch.behavior?.interactionPattern?.trim())
                || Boolean(job.editorialPatch.behavior?.description?.trim())
                || Boolean(job.editorialPatch.behavior?.inferredFrom?.trim())
                || (job.editorialPatch.behavior?.notes?.length ?? 0) > 0
                || Boolean(job.editorialPatch.accessibility?.role?.trim())
                || (job.editorialPatch.accessibility?.labeling?.rules?.length ?? 0) > 0
                || (job.editorialPatch.accessibility?.notes?.length ?? 0) > 0
            )
        ),
    );

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

    // Progress bar: derives percent/label from events + pipelineStage + slow-fill
    const { percent, label, isActive: isProgressActive } = useJobProgress(
        events,
        job?.status ?? 'pending',
        job?.pipelineStage,
    );

    // Timeline collapsed by default while running, visible otherwise.
    const [showTimeline, setShowTimeline] = useState(job?.status !== 'running');

    // Fire-once guard for onJobComplete — prevents duplicate calls on re-renders
    const jobCompleteCalledRef = useRef(false);
    useEffect(() => {
        if (
            job?.status === 'completed'
            && hasCompleteOutputForSuggestions
            && hasMeaningfulSuggestionContent
            && job.output
            && onJobComplete
            && !jobCompleteCalledRef.current
        ) {
            jobCompleteCalledRef.current = true;
            onJobComplete({
                output: job.output,
                editorialPatch: job.editorialPatch ?? null,
            });
        }
    }, [job?.status, job?.output, job?.editorialPatch, onJobComplete, hasCompleteOutputForSuggestions, hasMeaningfulSuggestionContent]);
    // Reset guard when jobId changes (new job)
    useEffect(() => {
        jobCompleteCalledRef.current = false;
    }, [jobId]);

    const handleCancel = async () => {
        if (!jobId) return;
        setIsCancelling(true);
        setCancelError(null);
        try {
            await cancelAiJob(jobId);
        } catch (err) {
            console.error('Failed to cancel job:', err);
            setCancelError(err instanceof Error ? err.message : 'Unable to cancel job.');
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

    useEffect(() => {
        if (!job) return;
        setShowTimeline(job.status !== 'running');
    }, [job?.status]);
    useEffect(() => {
        if (!job) return;
        if (job.status === 'cancelled' || job.status === 'completed' || job.status === 'failed') {
            setCancelError(null);
        }
    }, [job?.status]);

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
        const errorDisplay = toApiErrorDisplay(error, {
            fallbackTitle: 'Unable to load job status',
            fallbackMessage: 'Unable to load job status.',
        });
        return (
            <Card>
                <CardContent className="pt-6">
                    <ApiErrorMessage error={errorDisplay} />
                </CardContent>
            </Card>
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
    const canCancel = job.status === 'queued' || job.status === 'pending' || job.status === 'running';
    const canApply = job.status === 'completed' && job.output;
    const canRetry = job.status === 'failed' && job.retryable;
    const blockedByValidation = job.canPublish === false;
    const validationFailed = events.some((evt) => evt.event === 'validation.report_failed');
    const componentDisplayName =
        String(job.output?.title || '').trim()
        || String(componentNamesById?.[job.input.componentId] || '').trim()
        || 'Component';

    return (
        <Card className={className}>
            {!hideHeader && (
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                {componentDisplayName}
                            </CardTitle>
                            <CardDescription>
                                {job.input.provider} • {job.input.model || 'default model'}
                            </CardDescription>
                        </div>
                        <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
                    </div>
                </CardHeader>
            )}

            <CardContent className="space-y-4 pt-5">
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
                {cancelError && (
                    <StatusAlert
                        variant="warning"
                        title="Cancel request failed"
                        description={cancelError}
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

                {/* Progress bar (only while running/queued) */}
                {isProgressActive && (
                    <JobProgressBar percent={percent} label={label} />
                )}
                {job.status === 'completed' && job.output && (
                    <div className="inline-flex items-center rounded-full border border-status-success-border/30 bg-status-success-bg/15 px-2.5 py-0.5 text-xs font-semibold text-status-success transition-colors">
                        success
                    </div>
                )}

                {/* Events timeline — collapsed by default while running */}
                {events.length > 0 && (
                    <div className="space-y-2">
                        {job.status === 'running' && (
                            <div className="flex justify-end">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-xs"
                                    onClick={() => setShowTimeline(prev => !prev)}
                                >
                                    {showTimeline ? 'Hide details' : 'Show details'}
                                </Button>
                            </div>
                        )}
                        {(showTimeline || job.status !== 'running') && (
                            <div className="max-h-48 overflow-y-auto space-y-1 text-sm border rounded-md p-2">
                                {events.map((evt) => (
                                    <div key={evt.seq} className="flex gap-2 text-xs">
                                        <span className="text-muted-foreground shrink-0">
                                            {formatRelativeTime(evt.ts, { locale: 'en' })}
                                        </span>
                                        <span className="text-foreground">
                                            {formatJobEvent(evt)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Preview toggle */}
                {job.status === 'completed' && job.output?.markdown && !hidePreviewButton && (
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

                {/* Validation report panel: show details if report exists, blocked publish, or validation attempt failed */}
                {job.status === 'completed' && (job.validationReport || blockedByValidation || validationFailed || !!job.pipelineStage) && (
                    <ValidationReportPanel
                        report={job.validationReport}
                        canPublish={job.canPublish}
                        jobStatus={job.status}
                        pipelineStage={job.pipelineStage}
                        showFailOpenNotice={validationFailed}
                    />
                )}

                {/* Actions */}
                <div className="flex justify-end gap-2">
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

                    {canApply && onApply && (
                        <Button
                            size="sm"
                            onClick={handleApply}
                            disabled={blockedByValidation}
                            title={blockedByValidation ? 'Cannot apply: validation blocked' : undefined}
                        >
                            Apply
                        </Button>
                    )}
                </div>
            </CardContent>

            {job.status === 'completed' && resolvedPreviewMarkdown ? (
                <Modal
                    open={showPreview}
                    onClose={() => setShowPreview(false)}
                    aria-labelledby="ai-doc-preview-modal-title"
                    zIndex={1200}
                >
                    <ModalContent size="lg" className="flex max-h-[85vh] flex-col overflow-hidden">
                        <ModalHeader>
                            <div>
                                <h3 id="ai-doc-preview-modal-title" className="text-base font-titles font-semibold titles-color">
                                    Documentation Preview
                                </h3>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Generated markdown preview for this job.
                                </p>
                            </div>
                            <ModalCloseButton onClick={() => setShowPreview(false)} />
                        </ModalHeader>
                        <div className="min-h-0 flex-1 overflow-y-auto p-5">
                            <AiDocPreview markdown={resolvedPreviewMarkdown} />
                        </div>
                    </ModalContent>
                </Modal>
            ) : null}
        </Card>
    );
}
