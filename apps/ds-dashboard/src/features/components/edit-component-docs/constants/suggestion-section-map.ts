/**
 * Suggestion section map — closed, exhaustive mapping from SectionId to
 * label, extract, and apply logic.
 *
 * This is the single source of truth for which sections appear in the
 * AI suggestions panel and how "Use this" applies each one.
 */

import type { ComponentDocOutput, ComponentDocVariant } from '@/types/ai-jobs';

/**
 * Sections currently supported by AI output for direct "Use this" application.
 * `bestPractices` is intentionally omitted because it is not generated in the
 * current structured suggestion payload.
 */
export type SectionId = 'summary' | 'variants' | 'accessibilityNotes';

export interface SectionDefinition {
  label: string;
  extract: (suggestion: ComponentDocOutput) => unknown;
}

export const SUGGESTION_SECTION_MAP: Record<SectionId, SectionDefinition> = {
  summary: {
    label: 'Summary',
    extract: (s) => s.summary,
  },
  variants: {
    label: 'Variants',
    extract: (s) => s.variants,
  },
  accessibilityNotes: {
    label: 'Accessibility',
    extract: (s) => s.accessibilityNotes,
  },
} as const;

/**
 * Canonical order of sections for rendering in the edit-docs page.
 * Desktop uses this to align form/suggestion rows; mobile iterates
 * over it when toggling between panels.
 */
export const SECTION_ORDER = [
  'summary',
  'variants',
  'accessibilityNotes',
] as const satisfies readonly SectionId[];

export type FormDispatchAction =
  | { type: 'SET_SUMMARY'; payload: string }
  | { type: 'SET_VARIANTS'; payload: ComponentDocVariant[] }
  | { type: 'SET_ACC_NOTES'; payload: string[] };

export function applySectionAction(
  action: FormDispatchAction,
  current: Record<string, unknown>,
): Record<string, unknown> {
  switch (action.type) {
    case 'SET_SUMMARY':
      return { ...current, summary: action.payload };
    case 'SET_VARIANTS':
      return { ...current, variants: action.payload };
    case 'SET_ACC_NOTES':
      return { ...current, accessibilityNotes: action.payload };
    default: {
      const _exhaustive: never = action;
      return current;
    }
  }
}
