/**
 * AiSuggestionsModal — full-width modal with AI job creation and status.
 *
 * Contains AiJobCreateForm (locked to component) and AiJobStatusCard.
 * On job completion, saves the suggestion and enables "View suggestions".
 */

import { useState, useCallback } from 'react';
import type { AiJobStatus, AiSuggestionPayload } from '@/types/ai-jobs';
import { Modal, ModalContent, ModalHeader } from '@/components/ui/overlay';
import { Button } from '@/components/ui/button';
import { AiJobCreateForm } from '@/components/composites/ai-job-create-form';
import { AiJobStatusCard } from '@/components/composites/ai-job-status-card';
import { cancelAiJob } from '@/lib/ai-jobs-api';

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
  const formId = 'ai-suggestions-create-form';
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeJobStatus, setActiveJobStatus] = useState<AiJobStatus | null>(null);
  const [canViewSuggestions, setCanViewSuggestions] = useState(false);
  const [submitState, setSubmitState] = useState({ disabled: true, pending: false });

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
    // Closing the modal reveals the persisted suggestion cards in the parent edit page.
    onClose();
  }, [onClose]);

  const handleSubmitStateChange = useCallback((nextState: { disabled: boolean; pending: boolean }) => {
    setSubmitState((prev) => (
      prev.disabled === nextState.disabled && prev.pending === nextState.pending
        ? prev
        : nextState
    ));
  }, []);

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
      <ModalContent
        size="lg"
        className="flex w-[min(96vw,1100px)] max-h-[78vh] max-w-[1100px] flex-col overflow-hidden"
      >
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
            <Button variant="outline" size="sm" onClick={handleClose}>
              Close
            </Button>
          </div>
        </ModalHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid gap-6 lg:grid-cols-2">
            <AiJobCreateForm
              formId={formId}
              hideSubmitButton
              lockedComponentId={figmaComponentId}
              onSubmitStateChange={handleSubmitStateChange}
              onJobCreated={handleJobCreated}
            />

            {activeJobId ? (
              <AiJobStatusCard
                jobId={activeJobId}
                onStatusChange={setActiveJobStatus}
                onJobComplete={handleJobComplete}
                hideHeader
                hidePreviewButton
              />
            ) : (
              <div className="rounded-md border border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
                Progress information will appear here after you start generation.
              </div>
            )}
          </div>
          <div className="mt-6 flex justify-end gap-2 border-t border-border/70 pt-4">
            <Button type="submit" form={formId} disabled={submitState.disabled}>
              {submitState.pending ? 'Creating Job...' : 'Generate documentation'}
            </Button>
            {canViewSuggestions && (
              <Button onClick={handleViewSuggestions}>View suggestions</Button>
            )}
          </div>
        </div>
      </ModalContent>
    </Modal>
  );
}
