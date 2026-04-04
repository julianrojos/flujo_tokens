/**
 * AiDocsPage
 * Main page for AI documentation generation
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/composites';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { StatusAlert } from '@/components/ui/status-alert';
import { AiJobCreateForm } from './components/ai-job-create-form';
import { AiJobStatusCard } from './components/ai-job-status-card';
import { AiDocDiffViewer } from './components/ai-doc-diff-viewer';
import { AiDocStalenessBadge } from './components/ai-doc-staleness-badge';
import { useAiDocStatus } from './hooks/use-ai-doc-status';
import { useAiJobEvents } from './hooks/use-ai-job-events';
import { fetchComponentRegistry } from '@/lib/api';
import type { AiJobStatus, AiJobInput, AiProviderName } from '@/types/ai-jobs';

function parseStatusFilter(value: string): 'all' | 'stale-missing' {
    return value === 'stale-missing' ? 'stale-missing' : 'all';
}

export function AiDocsPage() {
    const queryClient = useQueryClient();
    const [activeJobId, setActiveJobId] = useState<string | null>(null);
    const activeJobIdRef = useRef<string | null>(null);
    const [prefillComponentId, setPrefillComponentId] = useState<string>('');
    const [prefillProvider, setPrefillProvider] = useState<AiProviderName | undefined>(undefined);
    const [prefillModel, setPrefillModel] = useState<string | undefined>(undefined);
    const [showDiff, setShowDiff] = useState(false);
    const [statusFilter, setStatusFilter] = useState<'all' | 'stale-missing'>('all');

    // Keep ref in sync with activeJobId state
    useEffect(() => {
        activeJobIdRef.current = activeJobId;
    }, [activeJobId]);

    // Staleness data
    const { data: docStatus, isLoading: isLoadingStatus } = useAiDocStatus();
    const { data: componentRegistry, error: componentRegistryError } = useQuery({
        queryKey: ['component-registry'],
        queryFn: fetchComponentRegistry,
        staleTime: 60_000,
    });
    const componentOptions = useMemo(
        () =>
            (componentRegistry?.components ?? [])
                .map((component) => {
                    const componentId = component.figma.component_set_node_id?.trim() ?? '';
                    if (!componentId) {
                        return null;
                    }
                    const displayName = component.display_name?.trim() || component.slug;
                    return {
                        value: componentId,
                        label: `${displayName} (${component.slug})`,
                    };
                })
                .filter((option): option is { value: string; label: string } => option !== null)
                .sort((a, b) => a.label.localeCompare(b.label)),
        [componentRegistry],
    );

    // Callback for when job reaches terminal state
    const handleJobDone = useCallback((status: AiJobStatus) => {
        // Refresh status + final job payload (output/usage) once SSE reports completion
        if (status === 'completed') {
            queryClient.invalidateQueries({ queryKey: ['ai-doc-status'] });
        }
        // Use ref to avoid re-creating callback when activeJobId changes
        if (activeJobIdRef.current) {
            queryClient.invalidateQueries({ queryKey: ['ai-job', activeJobIdRef.current] });
            queryClient.invalidateQueries({ queryKey: ['ai-job-diff', activeJobIdRef.current] });
        }
    }, [queryClient]);

    // SSE events for active job
    const { events: jobEvents, isStreaming, connectionError } = useAiJobEvents({
        jobId: activeJobId,
        onDone: handleJobDone,
    });

    // SSE is the primary status source. Polling is enabled only as fallback on SSE error.
    const enablePollingFallback = connectionError;
    const filteredComponents = (docStatus?.components ?? []).filter((component) => {
        if (statusFilter === 'stale-missing') {
            return component.status === 'stale' || component.status === 'missing';
        }
        return true;
    });

    const handleJobCreated = useCallback((jobId: string) => {
        setActiveJobId(jobId);
        setShowDiff(false);
        // Invalidate doc status to reflect potential new doc
        queryClient.invalidateQueries({ queryKey: ['ai-doc-status'] });
    }, [queryClient]);

    const handleApplyRequest = useCallback((jobId: string) => {
        // Show diff viewer first
        setActiveJobId(jobId);
        setShowDiff(true);
    }, []);

    const handleApplyDone = useCallback(() => {
        // After apply, refresh status and reset
        queryClient.invalidateQueries({ queryKey: ['ai-doc-status'] });
        setShowDiff(false);
        setActiveJobId(null);
    }, [queryClient]);

    const handleApplyCancel = useCallback(() => {
        setShowDiff(false);
    }, []);

    const handleRegenerate = useCallback((componentId: string) => {
        setPrefillComponentId(componentId);
        setShowDiff(false);
        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, []);

    const handleRetry = useCallback((input: AiJobInput) => {
        // Pre-fill the form with the failed job's data and clear the current job
        setPrefillComponentId(input.componentId);
        setPrefillProvider(input.provider);
        setPrefillModel(input.model ?? '');
        setActiveJobId(null);
        setShowDiff(false);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, []);

    // Show diff viewer when Apply is requested
    if (showDiff && activeJobId) {
        return (
            <div className="container mx-auto py-6 space-y-6">
                <PageHeader
                    title="Review Changes"
                    description="Review the diff before applying changes to documentation"
                />

                <AiDocDiffViewer
                    jobId={activeJobId}
                    onApply={handleApplyDone}
                    onCancel={handleApplyCancel}
                />
            </div>
        );
    }

    return (
        <div className="container mx-auto py-6 space-y-6">
            <PageHeader
                title="AI Documentation"
                description="Generate component documentation using AI"
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left column: Job creation form */}
                <Card>
                    <CardHeader>
                        <CardTitle>Generate Documentation</CardTitle>
                        <CardDescription>
                            Create a new job to generate documentation for a Figma component
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {componentRegistryError ? (
                            <StatusAlert
                                variant="warning"
                                description="Unable to load component list from database. Retry in a moment."
                                className="mb-4"
                            >
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        queryClient.invalidateQueries({ queryKey: ['component-registry'] });
                                    }}
                                    className="h-auto p-0 text-xs underline"
                                >
                                    Retry
                                </Button>
                            </StatusAlert>
                        ) : null}
                        <AiJobCreateForm
                            initialComponentId={prefillComponentId}
                            componentOptions={componentOptions}
                            initialProvider={prefillProvider}
                            initialModel={prefillModel}
                            onJobCreated={handleJobCreated}
                        />
                    </CardContent>
                </Card>

                {/* Right column: Job status */}
                <Card>
                    <CardHeader>
                        <CardTitle>Job Status</CardTitle>
                        <CardDescription>
                            View the progress and output of your generation job
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {activeJobId ? (
                            <AiJobStatusCard
                                jobId={activeJobId}
                                onApply={handleApplyRequest}
                                onRetry={handleRetry}
                                isStreaming={isStreaming}
                                externalEvents={jobEvents}
                                enablePolling={enablePollingFallback}
                            />
                        ) : (
                            <div className="text-center py-8 text-muted-foreground">
                                <p>No active job</p>
                                <p className="text-sm">
                                    Create a job to see its status here
                                </p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Staleness section */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between gap-3">
                        <CardTitle>Component Documentation Status</CardTitle>
                        <Select
                            value={statusFilter}
                            onChange={(event) =>
                                setStatusFilter(parseStatusFilter(event.target.value))
                            }
                            className="w-auto min-w-[220px]"
                        >
                            <option value="all">Show all components</option>
                            <option value="stale-missing">Only stale/missing</option>
                        </Select>
                    </div>
                    <CardDescription>
                        View which components have up-to-date documentation
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {!docStatus?.connected && (
                        <StatusAlert
                            variant="warning"
                            description="Figma plugin not connected — staleness information may be inaccurate"
                            className="mb-4"
                        />
                    )}

                    {isLoadingStatus ? (
                        <div className="text-center py-4 text-muted-foreground">
                            Loading...
                        </div>
                    ) : filteredComponents.length > 0 ? (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b">
                                        <th className="text-left py-2 px-2">Component ID</th>
                                        <th className="text-left py-2 px-2">Slug</th>
                                        <th className="text-left py-2 px-2">Status</th>
                                        <th className="text-left py-2 px-2">Generated</th>
                                        <th className="text-left py-2 px-2">Last Changed</th>
                                        <th className="text-left py-2 px-2">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredComponents.map((comp) => (
                                        <tr key={comp.componentId} className="border-b hover:bg-muted/50">
                                            <td className="py-2 px-2 font-mono text-xs">
                                                {comp.componentId.slice(0, 12)}...
                                            </td>
                                            <td className="py-2 px-2">{comp.slug}</td>
                                            <td className="py-2 px-2">
                                                <AiDocStalenessBadge status={comp.status} />
                                            </td>
                                            <td className="py-2 px-2 text-muted-foreground">
                                                {comp.generatedAt
                                                    ? new Date(comp.generatedAt).toLocaleDateString()
                                                    : '-'}
                                            </td>
                                            <td className="py-2 px-2 text-muted-foreground">
                                                {comp.lastChangeAt
                                                    ? new Date(comp.lastChangeAt).toLocaleDateString()
                                                    : '-'}
                                            </td>
                                            <td className="py-2 px-2">
                                                {(comp.status === 'missing' || comp.status === 'stale') && (
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleRegenerate(comp.componentId)}
                                                        className="h-auto p-0 text-xs text-accent hover:text-accent-hover hover:underline"
                                                    >
                                                        {comp.status === 'missing' ? 'Generate' : 'Re-generate'}
                                                    </Button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="text-center py-8 text-muted-foreground">
                            {statusFilter === 'stale-missing' ? (
                                <>
                                    <p>No stale or missing components</p>
                                    <p className="text-sm">All tracked docs are fresh.</p>
                                </>
                            ) : (
                                <>
                                    <p>No documented components yet</p>
                                    <p className="text-sm">
                                        Use the form above to generate your first doc
                                    </p>
                                </>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
