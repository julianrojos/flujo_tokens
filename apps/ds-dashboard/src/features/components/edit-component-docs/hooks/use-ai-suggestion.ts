/**
 * useAiSuggestion — localStorage versioned suggestion for a component.
 *
 * Stores AI-generated ComponentDocOutput in localStorage with a versioned payload.
 * Read failures (corrupt JSON, version mismatch, wrong slug) return null and
 * clean up the stale entry.
 */

import { useState, useCallback } from 'react';
import type { ComponentDocOutput } from '@/types/ai-jobs';

const CURRENT_VERSION = 1;
const SUGGESTION_KEY = (slug: string) => `ai-suggestion-v1-${slug}`;
const MAX_SUGGESTION_BYTES = 4_000_000;

interface StoredSuggestion {
  version: typeof CURRENT_VERSION;
  slug: string;
  generatedAt: string;
  suggestion: ComponentDocOutput;
}

export function useAiSuggestion(slug: string) {
  const [isInMemoryOnly, setIsInMemoryOnly] = useState(false);
  const [suggestion, setSuggestion] = useState<ComponentDocOutput | null>(() => {
    try {
      const raw = localStorage.getItem(SUGGESTION_KEY(slug));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as unknown;
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        (parsed as StoredSuggestion).version !== CURRENT_VERSION ||
        (parsed as StoredSuggestion).slug !== slug
      ) {
        localStorage.removeItem(SUGGESTION_KEY(slug));
        return null;
      }
      return (parsed as StoredSuggestion).suggestion;
    } catch {
      return null;
    }
  });

  const saveSuggestion = useCallback(
    (output: ComponentDocOutput) => {
      const stored: StoredSuggestion = {
        version: CURRENT_VERSION,
        slug,
        generatedAt: new Date().toISOString(),
        suggestion: output,
      };
      const serialized = JSON.stringify(stored);
      const byteSize = new Blob([serialized]).size;

      if (byteSize > MAX_SUGGESTION_BYTES) {
        console.warn(
          `[useAiSuggestion] Suggestion too large for localStorage (${byteSize} bytes, max ${MAX_SUGGESTION_BYTES}). Keeping it in memory only.`,
        );
        setIsInMemoryOnly(true);
        setSuggestion(output);
        return;
      }

      try {
        localStorage.setItem(SUGGESTION_KEY(slug), serialized);
      } catch {
        // Quota exceeded or localStorage blocked — fail-open
        setIsInMemoryOnly(true);
        setSuggestion(output);
        return;
      }
      setIsInMemoryOnly(false);
      setSuggestion(output);
    },
    [slug],
  );

  const clearSuggestion = useCallback(() => {
    try {
      localStorage.removeItem(SUGGESTION_KEY(slug));
    } catch {
      // Silently ignore
    }
    setIsInMemoryOnly(false);
    setSuggestion(null);
  }, [slug]);

  return { suggestion, saveSuggestion, clearSuggestion, isInMemoryOnly };
}
