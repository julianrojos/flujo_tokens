/**
 * AiSuggestionsModal — full-width modal with AI job creation and status.
 *
 * Contains AiJobCreateForm (locked to component) and AiJobStatusCard.
 * On job completion, saves the suggestion and enables "View suggestions".
 */

import { useState, useCallback } from 'react';
import type { AiJobStatus, ComponentDocOutput } from '@/types/ai-jobs';
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
  onSaveSuggestion: (output: ComponentDocOutput) => void;
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

  const handleJobCreated = useCallback((jobId: string) => {
    setActiveJobId(jobId);
    setActiveJobStatus('queued');
    setCanViewSuggestions(false);
  }, []);

  const handleJobComplete = useCallback(
    (output: ComponentDocOutput) => {
      onSaveSuggestion(output);
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
          <div className="space-y-6">
            <AiJobCreateForm
              lockedComponentId={figmaComponentId}
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
        </div>
      </ModalContent>
    </Modal>
  );
}
