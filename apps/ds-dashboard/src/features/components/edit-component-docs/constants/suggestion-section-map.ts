/**
 * Suggestion section map — closed, exhaustive mapping from SectionId to
 * label, extract, and apply logic.
 *
 * This is the single source of truth for which sections appear in the
 * AI suggestions panel and how "Use this" applies each one.
 */

import type { AiSuggestionPayload, ComponentDocVariant } from '@/types/ai-jobs';
import type {
  EditDocsAccessibilityValue,
  EditDocsSummaryValue,
} from '../components/edit-docs-form';
import { normalizeStringList } from '../normalizers';

function extractSummary(suggestion: AiSuggestionPayload): EditDocsSummaryValue {
  const summary = suggestion.editorialPatch?.summary;
  return {
    purpose: String(summary?.purpose ?? suggestion.output.summary ?? '').trim(),
    whenToUse: String(summary?.when_to_use ?? '').trim(),
    whenNotToUse: String(summary?.when_not_to_use ?? '').trim(),
  };
}

function extractContentGuidelines(suggestion: AiSuggestionPayload): string[] {
  return normalizeStringList(suggestion.editorialPatch?.content_guidelines?.rules);
}

function extractBehaviour(suggestion: AiSuggestionPayload): string {
  const behavior = suggestion.editorialPatch?.behavior;
  const description = String(behavior?.description ?? '').trim();
  if (description.length > 0) return description;

  const interactionPattern = String(behavior?.interactionPattern ?? '').trim();
  if (interactionPattern.length > 0) return `Interaction pattern: ${interactionPattern}.`;

  const inferredFrom = String(behavior?.inferredFrom ?? '').trim();
  if (inferredFrom.length > 0) return inferredFrom;

  const firstNote = normalizeStringList(behavior?.notes)[0];
  return firstNote ?? '';
}

function extractAccessibility(suggestion: AiSuggestionPayload): EditDocsAccessibilityValue {
  const accessibility = suggestion.editorialPatch?.accessibility;
  const editorialGuidance = Array.from(new Set([
    ...normalizeStringList(accessibility?.labeling?.rules),
    ...normalizeStringList(accessibility?.notes),
  ]));
  return {
    role: String(accessibility?.role ?? '').trim(),
    guidance: editorialGuidance.length > 0
      ? editorialGuidance
      : normalizeStringList(suggestion.output.accessibilityNotes),
  };
}

export type SectionId =
  | 'summary'
  | 'behaviour'
  | 'variants'
  | 'contentGuidelines'
  | 'accessibility';

export interface SectionDefinition {
  label: string;
  extract: (suggestion: AiSuggestionPayload) => unknown;
}

export const SUGGESTION_SECTION_MAP: Record<SectionId, SectionDefinition> = {
  summary: {
    label: 'Summary',
    extract: extractSummary,
  },
  behaviour: {
    label: 'Behaviour',
    extract: extractBehaviour,
  },
  variants: {
    label: 'Variants',
    extract: (suggestion) => suggestion.output.variants,
  },
  contentGuidelines: {
    label: 'Content Guidelines',
    extract: extractContentGuidelines,
  },
  accessibility: {
    label: 'Accessibility',
    extract: extractAccessibility,
  },
} as const;

export const SECTION_ORDER = [
  'summary',
  'behaviour',
  'variants',
  'contentGuidelines',
  'accessibility',
] as const satisfies readonly SectionId[];

export type FormDispatchAction =
  | { type: 'SET_SUMMARY'; payload: EditDocsSummaryValue }
  | { type: 'SET_BEHAVIOUR'; payload: string }
  | { type: 'SET_VARIANTS'; payload: ComponentDocVariant[] }
  | { type: 'SET_CONTENT_GUIDELINES'; payload: string[] }
  | { type: 'SET_ACCESSIBILITY'; payload: EditDocsAccessibilityValue };

export function applySectionAction(
  action: FormDispatchAction,
  current: Record<string, unknown>,
): Record<string, unknown> {
  switch (action.type) {
    case 'SET_SUMMARY':
      return { ...current, summary: action.payload };
    case 'SET_BEHAVIOUR':
      return { ...current, behaviour: action.payload };
    case 'SET_VARIANTS':
      return { ...current, variants: action.payload };
    case 'SET_CONTENT_GUIDELINES':
      return { ...current, contentGuidelines: action.payload };
    case 'SET_ACCESSIBILITY':
      return { ...current, accessibility: action.payload };
    default: {
      const _exhaustive: never = action;
      return current;
    }
  }
}
