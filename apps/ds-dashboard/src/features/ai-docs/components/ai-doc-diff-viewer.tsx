/**
 * AiDocDiffViewer Component
 * Shows diff between generated and existing documentation with confirmation
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusAlert } from '@/components/ui/status-alert';
import { useAiJobDiff } from '../hooks/use-ai-job-diff';
import { applyAiJobEditorial } from '../lib/ai-jobs-api';
import { useQueryClient } from '@tanstack/react-query';
import type { DiffResult } from '@/types/ai-jobs';

interface AiDocDiffViewerProps {
    jobId: string;
    onApply?: (jobId: string) => void;
    onCancel?: () => void;
}

export function AiDocDiffViewer({ jobId, onApply, onCancel }: AiDocDiffViewerProps) {
    const { diff, isLoading, error, invalidateDiff } = useAiJobDiff({ jobId });
    const [isApplying, setIsApplying] = useState(false);
    const [applyResult, setApplyResult] = useState<{ suggestionId: number; status: string } | null>(null);
    const queryClient = useQueryClient();

    const handleCreateSuggestion = async () => {
        setIsApplying(true);
        try {
            const result = await applyAiJobEditorial(jobId);
            setApplyResult({ suggestionId: result.suggestionId, status: result.status });

            // Invalidate related queries after successful apply
            queryClient.invalidateQueries({ queryKey: ['ai-doc-status'] });
            queryClient.invalidateQueries({ queryKey: ['ai-job', jobId] });
            invalidateDiff();

            onApply?.(jobId);
        } catch (err) {
            console.error('Failed to apply editorial suggestion:', err);
        } finally {
            setIsApplying(false);
        }
    };

    if (isLoading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Loading diff...</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">Computing diff</p>
                </CardContent>
            </Card>
        );
    }

    if (error) {
        return (
            <StatusAlert
                variant="error"
                title="Unable to load diff"
                description={error.message}
            />
        );
    }

    if (!diff) {
        return null;
    }

    if (applyResult) {
        return (
            <StatusAlert
                variant="success"
                title="Editorial suggestion created"
                description={`Suggestion #${applyResult.suggestionId} is pending. Open the component spec editor to review and apply it.`}
            />
        );
    }

    // New file - no previous version
    if (!diff.hasPrevious) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>New File</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">
                        This will create a new documentation file. No previous version exists.
                    </p>
                    <div className="flex gap-2">
                        <Button onClick={handleCreateSuggestion} disabled={isApplying}>
                            {isApplying ? 'Applying...' : 'Create editorial suggestion'}
                        </Button>
                        {onCancel && (
                            <Button variant="outline" onClick={onCancel}>
                                Cancel
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>
        );
    }

    // Show diff
    return (
        <Card>
            <CardHeader>
                <CardTitle>Review Changes</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="flex gap-4 mb-4 text-sm">
                    <span className="text-status-success">+{diff.stats.added} added</span>
                    <span className="text-status-error">-{diff.stats.removed} removed</span>
                </div>

                <div className="border rounded-md max-h-96 overflow-auto">
                    <pre className="text-xs p-4 whitespace-pre-wrap">
                        {diff.diff || 'No differences'}
                    </pre>
                </div>

                <div className="flex gap-2 mt-4">
                    <Button onClick={handleCreateSuggestion} disabled={isApplying}>
                        {isApplying ? 'Applying...' : 'Create editorial suggestion'}
                    </Button>
                    {onCancel && (
                        <Button variant="outline" onClick={onCancel}>
                            Cancel
                        </Button>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
