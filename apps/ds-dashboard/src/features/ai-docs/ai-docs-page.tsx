/**
 * AiDocsPage
 * Main page for AI documentation generation
 */

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AiJobCreateForm } from './components/ai-job-create-form';
import { AiJobStatusCard } from './components/ai-job-status-card';
import { AiDocDiffViewer } from './components/ai-doc-diff-viewer';
import { AiDocStalenessBadge } from './components/ai-doc-staleness-badge';
import { useAiDocStatus } from './hooks/use-ai-doc-status';
import { useAiJobEvents } from './hooks/use-ai-job-events';
import type { AiJobStatus, AiJobInput, AiProviderName } from '@/types/ai-jobs';

export function AiDocsPage() {
    const queryClient = useQueryClient();
    const [activeJobId, setActiveJobId] = useState<string | null>(null);
    const [prefillComponentId, setPrefillComponentId] = useState<string>('');
    const [prefillProvider, setPrefillProvider] = useState<AiProviderName | undefined>(undefined);
    const [prefillModel, setPrefillModel] = useState<string | undefined>(undefined);
    const [showDiff, setShowDiff] = useState(false);

    // Staleness data
    const { data: docStatus, isLoading: isLoadingStatus } = useAiDocStatus();

    // Callback for when job reaches terminal state
    const handleJobDone = useCallback((status: AiJobStatus) => {
        // Job completed, refresh doc status
        if (status === 'completed') {
            queryClient.invalidateQueries({ queryKey: ['ai-doc-status'] });
        }
    }, [queryClient]);

    // SSE events for active job
    const { events: jobEvents, isStreaming } = useAiJobEvents({
        jobId: activeJobId,
        onDone: handleJobDone,
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
                <div>
                    <h1 className="text-3xl font-bold">Review Changes</h1>
                    <p className="text-muted-foreground mt-1">
                        Review the diff before applying changes to documentation
                    </p>
                </div>

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
            <div>
                <h1 className="text-3xl font-bold">AI Documentation</h1>
                <p className="text-muted-foreground mt-1">
                    Generate component documentation using AI
                </p>
            </div>

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
                        <AiJobCreateForm
                            initialComponentId={prefillComponentId}
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
                    <CardTitle>Component Documentation Status</CardTitle>
                    <CardDescription>
                        View which components have up-to-date documentation
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {!docStatus?.connected && (
                        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                            <p className="text-sm text-yellow-800">
                                Figma plugin not connected — staleness information may be inaccurate
                            </p>
                        </div>
                    )}

                    {isLoadingStatus ? (
                        <div className="text-center py-4 text-muted-foreground">
                            Loading...
                        </div>
                    ) : docStatus?.components && docStatus.components.length > 0 ? (
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
                                    {docStatus.components.map((comp) => (
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
                                                    <button
                                                        onClick={() => handleRegenerate(comp.componentId)}
                                                        className="text-xs text-blue-600 hover:underline"
                                                    >
                                                        {comp.status === 'missing' ? 'Generate' : 'Re-generate'}
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="text-center py-8 text-muted-foreground">
                            <p>No documented components yet</p>
                            <p className="text-sm">
                                Use the form above to generate your first doc
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
