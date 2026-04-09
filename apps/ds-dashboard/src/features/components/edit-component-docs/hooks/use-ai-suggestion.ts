/**
 * useAiSuggestion — localStorage versioned suggestion for a component.
 *
 * Stores AI-generated ComponentDocOutput in localStorage with a versioned payload.
 * Read failures (corrupt JSON, version mismatch, wrong slug) return null and
 * clean up the stale entry.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import type { ComponentDocOutput } from '@/types/ai-jobs';

const CURRENT_VERSION = 1;
const toScope = (storageScope: string | null | undefined) =>
  String(storageScope || '').trim();
const SUGGESTION_KEY = (storageScope: string | null | undefined, slug: string) =>
  `ai-suggestion-v1-${toScope(storageScope)}-${slug}`;
const MAX_SUGGESTION_BYTES = 4_000_000;

interface StoredSuggestion {
  version: typeof CURRENT_VERSION;
  storageScope: string;
  slug: string;
  generatedAt: string;
  suggestion: ComponentDocOutput;
}

function readStoredSuggestion(storageKey: string, slug: string, storageScope?: string | null) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    const namespace = toScope(storageScope);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      (parsed as StoredSuggestion).version !== CURRENT_VERSION ||
      (parsed as StoredSuggestion).slug !== slug ||
      (parsed as StoredSuggestion).storageScope !== namespace
    ) {
      localStorage.removeItem(storageKey);
      return null;
    }
    return (parsed as StoredSuggestion).suggestion;
  } catch {
    return null;
  }
}

export function useAiSuggestion(slug: string, storageScope?: string | null) {
  const storageKey = useMemo(() => SUGGESTION_KEY(storageScope, slug), [slug, storageScope]);
  const [isInMemoryOnly, setIsInMemoryOnly] = useState(false);
  const [suggestion, setSuggestion] = useState<ComponentDocOutput | null>(() =>
    readStoredSuggestion(storageKey, slug, storageScope),
  );

  useEffect(() => {
    setSuggestion(readStoredSuggestion(storageKey, slug, storageScope));
    setIsInMemoryOnly(false);
  }, [storageKey, slug, storageScope]);

  const saveSuggestion = useCallback(
    (output: ComponentDocOutput) => {
      const stored: StoredSuggestion = {
        version: CURRENT_VERSION,
        storageScope: toScope(storageScope),
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
        localStorage.setItem(storageKey, serialized);
      } catch {
        // Quota exceeded or localStorage blocked — fail-open
        setIsInMemoryOnly(true);
        setSuggestion(output);
        return;
      }
      setIsInMemoryOnly(false);
      setSuggestion(output);
    },
    [slug, storageKey, storageScope],
  );

  const clearSuggestion = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Silently ignore
    }
    setIsInMemoryOnly(false);
    setSuggestion(null);
  }, [storageKey]);

  return { suggestion, saveSuggestion, clearSuggestion, isInMemoryOnly };
}
