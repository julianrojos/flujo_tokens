import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface AiPromptEditorCardProps {
    systemPrompt: string;
    userPrompt: string;
    placeholders: string[];
    disabled?: boolean;
    onSystemPromptChange: (value: string) => void;
    onUserPromptChange: (value: string) => void;
    onResetDefaults: () => void;
}

export function AiPromptEditorCard({
    systemPrompt,
    userPrompt,
    placeholders,
    disabled = false,
    onSystemPromptChange,
    onUserPromptChange,
    onResetDefaults,
}: AiPromptEditorCardProps) {
    return (
        <Card>
            <CardHeader>
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <CardTitle>Prompt Configuration</CardTitle>
                        <CardDescription>
                            Customize system and user prompts used for documentation generation.
                        </CardDescription>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={onResetDefaults} disabled={disabled}>
                        Reset defaults
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <label htmlFor="systemPrompt" className="text-sm font-medium">
                        System prompt
                    </label>
                    <textarea
                        id="systemPrompt"
                        value={systemPrompt}
                        onChange={(event) => onSystemPromptChange(event.target.value)}
                        disabled={disabled}
                        className="min-h-[180px] w-full rounded-md border border-input bg-surface-2 px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    />
                </div>

                <div className="space-y-2">
                    <label htmlFor="userPrompt" className="text-sm font-medium">
                        User prompt
                    </label>
                    <textarea
                        id="userPrompt"
                        value={userPrompt}
                        onChange={(event) => onUserPromptChange(event.target.value)}
                        disabled={disabled}
                        className="min-h-[220px] w-full rounded-md border border-input bg-surface-2 px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    {placeholders.length > 0 ? (
                        <p className="text-xs text-muted-foreground">
                            Available placeholders: {placeholders.join(', ')}
                        </p>
                    ) : null}
                </div>
            </CardContent>
        </Card>
    );
}
