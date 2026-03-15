/**
 * AiDocDiffViewer Component
 * Shows diff between generated and existing documentation with confirmation
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAiJobDiff } from '../hooks/use-ai-job-diff';
import { applyAiJob } from '../lib/ai-jobs-api';
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
    const [applyResult, setApplyResult] = useState<{ path: string; checksum: string } | null>(null);
    const queryClient = useQueryClient();

    const handleApply = async () => {
        setIsApplying(true);
        try {
            const result = await applyAiJob(jobId, { overwrite: true });
            setApplyResult({ path: result.path, checksum: result.checksum });
            
            // Invalidate related queries after successful apply
            queryClient.invalidateQueries({ queryKey: ['ai-doc-status'] });
            queryClient.invalidateQueries({ queryKey: ['ai-job', jobId] });
            invalidateDiff(); // Invalidate current diff
            
            onApply?.(jobId);
        } catch (err) {
            console.error('Failed to apply:', err);
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
            <Card className="border-destructive">
                <CardHeader>
                    <CardTitle className="text-destructive">Error</CardTitle>
                </CardHeader>
                <CardContent>
                    <p>{error.message}</p>
                </CardContent>
            </Card>
        );
    }

    if (!diff) {
        return null;
    }

    if (applyResult) {
        return (
            <Card className="border-green-500">
                <CardHeader>
                    <CardTitle className="text-green-600">Applied Successfully</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm">File: {applyResult.path}</p>
                    <p className="text-xs text-muted-foreground font-mono">Checksum: {applyResult.checksum}</p>
                </CardContent>
            </Card>
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
                        <Button onClick={handleApply} disabled={isApplying}>
                            {isApplying ? 'Applying...' : 'Confirm & Apply'}
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
                    <span className="text-green-600">+{diff.stats.added} added</span>
                    <span className="text-red-500">-{diff.stats.removed} removed</span>
                </div>

                <div className="border rounded-md max-h-96 overflow-auto">
                    <pre className="text-xs p-4 whitespace-pre-wrap">
                        {diff.diff || 'No differences'}
                    </pre>
                </div>

                <div className="flex gap-2 mt-4">
                    <Button onClick={handleApply} disabled={isApplying}>
                        {isApplying ? 'Applying...' : 'Confirm & Apply'}
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
