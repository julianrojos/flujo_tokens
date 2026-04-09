/**
 * useEditDocsDraft — localStorage draft auto-save for the edit docs form.
 *
 * Used to persist form state before opening the AI suggestions modal
 * (autosave on modal open) so the user doesn't lose unsaved changes.
 */

import { useCallback } from 'react';

const toScope = (storageScope: string | null | undefined) =>
  String(storageScope || '').trim();
const DRAFT_KEY = (slug: string, storageScope?: string | null) =>
  `edit-docs-draft-v1-${toScope(storageScope)}-${slug}`;

export interface EditDocsDraftPayload {
  summary: string;
  variants: unknown[];
  tokens: unknown[];
  accessibilityNotes: string[];
  touchedFields?: Array<'summary' | 'variants' | 'tokens' | 'accessibilityNotes'>;
}

export function useEditDocsDraft(slug: string, storageScope?: string | null) {
  const saveDraft = useCallback(
    (state: EditDocsDraftPayload) => {
      try {
        localStorage.setItem(DRAFT_KEY(slug, storageScope), JSON.stringify(state));
      } catch {
        // Quota exceeded — fail-open
      }
    },
    [slug, storageScope],
  );

  const restoreDraft = useCallback((): EditDocsDraftPayload | null => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY(slug, storageScope));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed as EditDocsDraftPayload;
    } catch {
      return null;
    }
  }, [slug, storageScope]);

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(DRAFT_KEY(slug, storageScope));
    } catch {
      // Silently ignore
    }
  }, [slug, storageScope]);

  return { saveDraft, restoreDraft, clearDraft };
}
