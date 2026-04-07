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
import { Modal, ModalContent, ModalHeader } from '@/components/ui/overlay';
import { AiJobCreateForm } from './components/ai-job-create-form';
import { AiJobStatusCard } from './components/ai-job-status-card';
import { AiDocDiffViewer } from './components/ai-doc-diff-viewer';
import { AiDocStalenessBadge } from './components/ai-doc-staleness-badge';
import { AiPromptEditorCard } from './components/ai-prompt-editor-card';
import { useAiDocStatus } from './hooks/use-ai-doc-status';
import { useAiJobEvents } from './hooks/use-ai-job-events';
import { fetchComponentRegistry } from '@/lib/api';
import { getAiPromptDefaults, previewAiPrompts } from './lib/ai-jobs-api';
import type { AiJobStatus, AiJobInput, AiProviderName, AiPromptPreviewResponse } from '@/types/ai-jobs';

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
    const [systemPrompt, setSystemPrompt] = useState('');
    const [userPrompt, setUserPrompt] = useState('');
    const [promptsInitialized, setPromptsInitialized] = useState(false);
    const [figmaUrlForPreview, setFigmaUrlForPreview] = useState('');
    const [showPromptPreview, setShowPromptPreview] = useState(false);
    const [previewPending, setPreviewPending] = useState(false);
    const [promptPreview, setPromptPreview] = useState<AiPromptPreviewResponse | null>(null);
    const [promptPreviewError, setPromptPreviewError] = useState<string | null>(null);

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
    const { data: promptDefaults, isLoading: isLoadingPromptDefaults, error: promptDefaultsError } = useQuery({
        queryKey: ['ai-prompt-defaults'],
        queryFn: getAiPromptDefaults,
        staleTime: 60_000,
    });

    useEffect(() => {
        if (!promptDefaults) return;
        if (promptsInitialized) return;
        setSystemPrompt(promptDefaults.systemPrompt);
        setUserPrompt(promptDefaults.userPrompt);
        setPromptsInitialized(true);
    }, [promptDefaults, promptsInitialized]);
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
    const componentNamesById = useMemo(
        () =>
            Object.fromEntries(
                componentOptions.map((option) => [option.value, option.label]),
            ) as Record<string, string>,
        [componentOptions],
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

    // Derive existing doc status for the currently selected component.
    // prefillComponentId is kept in sync by onComponentIdChange from the form.
    const existingDocStatus = useMemo(
        () => docStatus?.components.find((c) => c.componentId === prefillComponentId)?.status,
        [docStatus?.components, prefillComponentId],
    );

    const handleRetry = useCallback((input: AiJobInput) => {
        // Pre-fill the form with the failed job's data and clear the current job
        setPrefillComponentId(input.componentId);
        setPrefillProvider(input.provider);
        setPrefillModel(input.model ?? '');
        setActiveJobId(null);
        setShowDiff(false);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, []);

    const handleShowPromptPreview = useCallback(async () => {
        const trimmedComponentId = prefillComponentId.trim();
        if (!trimmedComponentId) return;

        setPromptPreview(null);
        setShowPromptPreview(false);
        setPromptPreviewError(null);
        setPreviewPending(true);

        try {
            const preview = await previewAiPrompts({
                componentId: trimmedComponentId,
                figmaUrl: figmaUrlForPreview.trim() || undefined,
                systemPrompt: systemPrompt.trim().length > 0 ? systemPrompt : undefined,
                userPrompt: userPrompt.trim().length > 0 ? userPrompt : undefined,
            });
            setPromptPreview(preview);
            setShowPromptPreview(true);
        } catch (error) {
            setPromptPreviewError(error instanceof Error ? error.message : 'Unable to preview prompts');
        } finally {
            setPreviewPending(false);
        }
    }, [figmaUrlForPreview, prefillComponentId, systemPrompt, userPrompt]);

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
                            systemPrompt={systemPrompt}
                            userPrompt={userPrompt}
                            onJobCreated={handleJobCreated}
                            onComponentIdChange={setPrefillComponentId}
                            onFigmaUrlChange={setFigmaUrlForPreview}
                            existingDocStatus={existingDocStatus}
                            isDocStatusLoading={isLoadingStatus}
                        />
                    </CardContent>
                </Card>

                <div className="space-y-4">
                    {promptDefaultsError ? (
                        <StatusAlert
                            variant="warning"
                            title="Unable to load prompt defaults"
                            description="Prompt defaults could not be loaded. If these fields stay empty, backend defaults will be used at generation time."
                        />
                    ) : null}
                    {promptPreviewError ? (
                        <StatusAlert
                            variant="warning"
                            title="Unable to preview prompts"
                            description={promptPreviewError}
                        />
                    ) : null}
                    <AiPromptEditorCard
                        systemPrompt={systemPrompt}
                        userPrompt={userPrompt}
                        placeholders={promptDefaults?.placeholders ?? []}
                        disabled={isLoadingPromptDefaults}
                        onSystemPromptChange={setSystemPrompt}
                        onUserPromptChange={setUserPrompt}
                        onResetDefaults={() => {
                            if (!promptDefaults) return;
                            setSystemPrompt(promptDefaults.systemPrompt);
                            setUserPrompt(promptDefaults.userPrompt);
                        }}
                        promptPreviewAction={
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                    void handleShowPromptPreview();
                                }}
                                disabled={prefillComponentId.trim().length === 0 || previewPending}
                                className="w-full"
                            >
                                {previewPending ? 'Rendering Prompt...' : 'Show Rendered Prompt Preview'}
                            </Button>
                        }
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
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
                                componentNamesById={componentNamesById}
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

            <Modal
                open={showPromptPreview}
                onClose={() => setShowPromptPreview(false)}
                aria-labelledby="ai-prompt-preview-title"
                zIndex={1200}
            >
                <ModalContent size="lg" className="flex max-h-[85vh] flex-col overflow-hidden">
                    <ModalHeader>
                        <div>
                            <h3 id="ai-prompt-preview-title" className="text-lg font-semibold">
                                Rendered Prompt Preview
                            </h3>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Interpolated prompts for component <span className="font-mono">{prefillComponentId.trim()}</span>.
                            </p>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => setShowPromptPreview(false)}>
                            Close
                        </Button>
                    </ModalHeader>
                    <div className="min-h-0 flex-1 overflow-y-auto p-5 space-y-4">
                        {promptPreview?.warning ? (
                            <StatusAlert
                                variant="warning"
                                description={promptPreview.warning}
                            />
                        ) : null}
                        {promptPreview ? (
                            <>
                                <p className="text-xs text-muted-foreground">
                                    Spec source: <span className="font-mono">{promptPreview.specSource}</span>
                                </p>
                                <div className="space-y-2">
                                    <p className="text-sm font-medium">System prompt</p>
                                    <pre className="max-h-56 overflow-auto rounded-md border border-border/70 bg-muted/30 p-3 text-xs whitespace-pre-wrap">
                                        {promptPreview.systemPrompt}
                                    </pre>
                                </div>
                                <div className="space-y-2">
                                    <p className="text-sm font-medium">User prompt</p>
                                    <pre className="max-h-[40vh] overflow-auto rounded-md border border-border/70 bg-muted/30 p-3 text-xs whitespace-pre-wrap">
                                        {promptPreview.userPrompt}
                                    </pre>
                                </div>
                            </>
                        ) : (
                            <p className="text-sm text-muted-foreground">No preview available.</p>
                        )}
                    </div>
                </ModalContent>
            </Modal>
        </div>
    );
}
