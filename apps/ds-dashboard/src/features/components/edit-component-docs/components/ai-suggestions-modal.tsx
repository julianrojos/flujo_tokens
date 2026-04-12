/**
 * AiSuggestionsModal — full-width modal with AI job creation and status.
 *
 * Contains AiJobCreateForm (locked to component) and AiJobStatusCard.
 * On job completion, saves the suggestion and enables "View suggestions".
 */

import { useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AiJobStatus, AiSuggestionPayload } from '@/types/ai-jobs';
import { Modal, ModalContent, ModalHeader } from '@/components/ui/overlay';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusAlert } from '@/components/ui/status-alert';
import { AiJobCreateForm } from '@/components/composites/ai-job-create-form';
import { AiJobStatusCard } from '@/components/composites/ai-job-status-card';
import { cancelAiJob, getAiPromptDefaults } from '@/lib/ai-jobs-api';

interface AiSuggestionsModalProps {
  open: boolean;
  onClose: () => void;
  /** Figma component node ID (not slug) for the locked job */
  figmaComponentId: string;
  onSaveSuggestion: (suggestion: AiSuggestionPayload) => void;
}

export function AiSuggestionsModal({
  open,
  onClose,
  figmaComponentId,
  onSaveSuggestion,
}: AiSuggestionsModalProps) {
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeJobStatus, setActiveJobStatus] = useState<AiJobStatus | null>(null);
  const [canViewSuggestions, setCanViewSuggestions] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [userPrompt, setUserPrompt] = useState('');
  const [promptsInitialized, setPromptsInitialized] = useState(false);
  const {
    data: promptDefaults,
    isLoading: isLoadingPromptDefaults,
    error: promptDefaultsError,
  } = useQuery({
    queryKey: ['ai-prompt-defaults'],
    queryFn: getAiPromptDefaults,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!open || !promptDefaults || promptsInitialized) return;
    setSystemPrompt(promptDefaults.systemPrompt);
    setUserPrompt(promptDefaults.userPrompt);
    setPromptsInitialized(true);
  }, [open, promptDefaults, promptsInitialized]);

  const handleJobCreated = useCallback((jobId: string) => {
    setActiveJobId(jobId);
    setActiveJobStatus('queued');
    setCanViewSuggestions(false);
  }, []);

  const handleJobComplete = useCallback(
    (suggestion: AiSuggestionPayload) => {
      onSaveSuggestion(suggestion);
      setCanViewSuggestions(true);
    },
    [onSaveSuggestion],
  );

  const handleViewSuggestions = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleClose = useCallback(() => {
    if (
      activeJobId &&
      activeJobStatus !== 'completed' &&
      activeJobStatus !== 'failed' &&
      activeJobStatus !== 'cancelled'
    ) {
      void cancelAiJob(activeJobId).catch((error) => {
        console.warn('[AiSuggestionsModal] Failed to cancel running AI job on close:', error);
      });
    }
    setActiveJobId(null);
    setActiveJobStatus(null);
    setCanViewSuggestions(false);
    onClose();
  }, [activeJobId, activeJobStatus, onClose]);

  return (
    <Modal open={open} onClose={handleClose} aria-labelledby="ai-suggestions-modal-title" zIndex={1200}>
      <ModalContent size="full" className="flex max-h-[90vh] flex-col overflow-hidden">
        <ModalHeader>
          <div>
            <h3 id="ai-suggestions-modal-title" className="text-lg font-semibold">
              AI Suggestions
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Generate documentation suggestions for this component.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canViewSuggestions && (
              <Button size="sm" onClick={handleViewSuggestions}>
                View suggestions
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleClose}>
              Close
            </Button>
          </div>
        </ModalHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <div className="space-y-6">
              <AiJobCreateForm
                lockedComponentId={figmaComponentId}
                systemPrompt={systemPrompt}
                userPrompt={userPrompt}
                onJobCreated={handleJobCreated}
              />

              {activeJobId && (
                <AiJobStatusCard
                  jobId={activeJobId}
                  onStatusChange={setActiveJobStatus}
                  onJobComplete={handleJobComplete}
                />
              )}
            </div>

            <div className="space-y-4">
              {promptDefaultsError ? (
                <StatusAlert
                  variant="warning"
                  title="Unable to load prompt defaults"
                  description="Prompt defaults could not be loaded. If these fields stay empty, backend defaults will be used at generation time."
                />
              ) : null}

              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle>Prompt Configuration</CardTitle>
                      <CardDescription>
                        Customize system and user prompts used for documentation generation.
                      </CardDescription>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (!promptDefaults) return;
                        setSystemPrompt(promptDefaults.systemPrompt);
                        setUserPrompt(promptDefaults.userPrompt);
                      }}
                      disabled={isLoadingPromptDefaults || !promptDefaults}
                    >
                      Reset defaults
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="aiSuggestionsSystemPrompt" className="text-sm font-medium">
                      System prompt
                    </label>
                    <textarea
                      id="aiSuggestionsSystemPrompt"
                      value={systemPrompt}
                      onChange={(event) => setSystemPrompt(event.target.value)}
                      disabled={isLoadingPromptDefaults}
                      className="min-h-[180px] w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="aiSuggestionsUserPrompt" className="text-sm font-medium">
                      User prompt
                    </label>
                    <textarea
                      id="aiSuggestionsUserPrompt"
                      value={userPrompt}
                      onChange={(event) => setUserPrompt(event.target.value)}
                      disabled={isLoadingPromptDefaults}
                      className="min-h-[220px] w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    {promptDefaults?.placeholders && promptDefaults.placeholders.length > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Available placeholders: {promptDefaults.placeholders.join(', ')}
                      </p>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </ModalContent>
    </Modal>
  );
}
