/**
 * useEditDocsDraft — localStorage draft auto-save for the edit docs form.
 *
 * Used to persist form state before opening the AI suggestions modal
 * (autosave on modal open) so the user doesn't lose unsaved changes.
 */

import { useCallback } from 'react';

const DRAFT_KEY = (slug: string) => `edit-docs-draft-${slug}`;

export interface EditDocsDraftPayload {
  summary: string;
  variants: unknown[];
  tokens: unknown[];
  accessibilityNotes: string[];
  touchedFields?: Array<'summary' | 'variants' | 'tokens' | 'accessibilityNotes'>;
}

export function useEditDocsDraft(slug: string) {
  const saveDraft = useCallback(
    (state: EditDocsDraftPayload) => {
      try {
        localStorage.setItem(DRAFT_KEY(slug), JSON.stringify(state));
      } catch {
        // Quota exceeded — fail-open
      }
    },
    [slug],
  );

  const restoreDraft = useCallback((): EditDocsDraftPayload | null => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY(slug));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed as EditDocsDraftPayload;
    } catch {
      return null;
    }
  }, [slug]);

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(DRAFT_KEY(slug));
    } catch {
      // Silently ignore
    }
  }, [slug]);

  return { saveDraft, restoreDraft, clearDraft };
}
