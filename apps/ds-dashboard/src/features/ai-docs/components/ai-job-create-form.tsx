/**
 * AiJobCreateForm Component
 * Form for creating AI documentation generation jobs
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useAiJobCreate } from '../hooks/use-ai-job-create';
import type { AiProviderName } from '@/types/ai-jobs';

interface AiJobCreateFormProps {
    /** Optional pre-filled component ID */
    initialComponentId?: string;
    /** Optional pre-filled provider */
    initialProvider?: AiProviderName;
    /** Optional pre-filled model */
    initialModel?: string;
    /** Callback when job is created */
    onJobCreated?: (jobId: string) => void;
}

const PROVIDER_OPTIONS: { value: AiProviderName; label: string }[] = [
    { value: 'anthropic', label: 'Anthropic (Claude)' },
    { value: 'openai', label: 'OpenAI' },
    { value: 'ollama', label: 'Ollama (Local)' },
];

const DEFAULT_MODELS: Record<AiProviderName, string> = {
    anthropic: 'claude-3-5-sonnet-20241022',
    openai: 'gpt-4o-mini',
    ollama: 'llama3.2',
};

export function AiJobCreateForm({ 
    initialComponentId = '', 
    initialProvider, 
    initialModel, 
    onJobCreated 
}: AiJobCreateFormProps) {
    const [provider, setProvider] = useState<AiProviderName>(initialProvider || 'anthropic');
    const [componentId, setComponentId] = useState(initialComponentId);
    const [model, setModel] = useState(initialModel || '');
    const [figmaUrl, setFigmaUrl] = useState('');
    const [dryRun, setDryRun] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);

    // Sync state when initial props change (e.g., from "Re-generar" or retry)
    useEffect(() => {
        if (initialComponentId) {
            setComponentId(initialComponentId);
        }
    }, [initialComponentId]);

    useEffect(() => {
        if (initialProvider) {
            setProvider(initialProvider);
        }
    }, [initialProvider]);

    useEffect(() => {
        if (initialModel !== undefined) {
            setModel(initialModel);
        }
    }, [initialModel]);

    const { mutate, isPending, error, reset } = useAiJobCreate({
        onSuccess: (jobId) => {
            onJobCreated?.(jobId);
        },
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (!componentId.trim()) {
            return;
        }

        // Reset error on submit
        reset();

        mutate({
            provider,
            componentId: componentId.trim(),
            model: model.trim() || undefined,
            figmaUrl: figmaUrl.trim() || undefined,
            dryRun,
        });
    };

    const isValid = componentId.trim().length > 0 && !isPending;

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {/* Provider Selection */}
            <div className="space-y-2">
                <label htmlFor="provider" className="text-sm font-medium">
                    AI Provider
                </label>
                <Select
                    id="provider"
                    value={provider}
                    onChange={(e) => setProvider(e.target.value as AiProviderName)}
                    disabled={isPending}
                >
                    {PROVIDER_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </Select>
            </div>

            {/* Component ID */}
            <div className="space-y-2">
                <label htmlFor="componentId" className="text-sm font-medium">
                    Component ID <span className="text-destructive">*</span>
                </label>
                <Input
                    id="componentId"
                    type="text"
                    placeholder="e.g., 123:456"
                    value={componentId}
                    onChange={(e) => setComponentId(e.target.value)}
                    disabled={isPending}
                    required
                />
                <p className="text-xs text-muted-foreground">
                    Figma component node ID (format: fileKey:nodeId or just nodeId)
                </p>
            </div>

            {/* Model (optional) */}
            <div className="space-y-2">
                <label htmlFor="model" className="text-sm font-medium">
                    Model (optional)
                </label>
                <Input
                    id="model"
                    type="text"
                    placeholder={`Default: ${DEFAULT_MODELS[provider]}`}
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    disabled={isPending}
                />
            </div>

            {/* Advanced Options Toggle */}
            <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-sm text-muted-foreground hover:text-foreground underline"
            >
                {showAdvanced ? 'Hide' : 'Show'} advanced options
            </button>

            {/* Advanced Options */}
            {showAdvanced && (
                <div className="space-y-4 p-4 bg-muted/30 rounded-md">
                    {/* Figma URL */}
                    <div className="space-y-2">
                        <label htmlFor="figmaUrl" className="text-sm font-medium">
                            Figma URL (optional)
                        </label>
                        <Input
                            id="figmaUrl"
                            type="url"
                            placeholder="https://www.figma.com/file/..."
                            value={figmaUrl}
                            onChange={(e) => setFigmaUrl(e.target.value)}
                            disabled={isPending}
                        />
                    </div>

                    {/* Dry Run */}
                    <div className="flex items-center gap-2">
                        <input
                            id="dryRun"
                            type="checkbox"
                            checked={dryRun}
                            onChange={(e) => setDryRun(e.target.checked)}
                            disabled={isPending}
                            className="rounded border-border"
                        />
                        <label htmlFor="dryRun" className="text-sm font-medium">
                            Dry run (skip LLM call)
                        </label>
                    </div>
                </div>
            )}

            {/* Error Display */}
            {error && (
                <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-md">
                    <p className="text-sm text-destructive">
                        {error.message || 'Failed to create job'}
                    </p>
                </div>
            )}

            {/* Submit Button */}
            <Button type="submit" disabled={!isValid} className="w-full">
                {isPending ? 'Creating Job...' : 'Generate Documentation'}
            </Button>
        </form>
    );
}
