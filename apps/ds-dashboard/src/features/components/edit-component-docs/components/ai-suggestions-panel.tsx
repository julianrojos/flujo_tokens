/**
 * AiSuggestionsPanel — renders AI suggestion sections with "Use this" buttons.
 */

import { useCallback } from 'react';
import type { AiSuggestionPayload, ComponentDocVariant } from '@/types/ai-jobs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  SUGGESTION_SECTION_MAP,
  type SectionId,
  type FormDispatchAction,
} from '../constants/suggestion-section-map';
import type {
  EditDocsAccessibilityValue,
  EditDocsBestPracticesValue,
  EditDocsSummaryValue,
} from './edit-docs-form';

export interface SummarySuggestionCardProps {
  value: EditDocsSummaryValue;
  onApply: () => void;
}

export function SummarySuggestionCard({ value, onApply }: SummarySuggestionCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Summary</CardTitle>
          <Button variant="outline" size="sm" onClick={onApply}>
            Use this
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <div>
          <p className="font-medium text-foreground">Purpose</p>
          <p>{value.purpose || 'No purpose in suggestion.'}</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <p className="font-medium text-foreground">When to use</p>
            <p>{value.whenToUse || 'No usage guidance in suggestion.'}</p>
          </div>
          <div>
            <p className="font-medium text-foreground">When not to use</p>
            <p>{value.whenNotToUse || 'No exclusion guidance in suggestion.'}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export interface VariantsSuggestionCardProps {
  value: ComponentDocVariant[];
  onApply: () => void;
}

export function VariantsSuggestionCard({ value, onApply }: VariantsSuggestionCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Variants</CardTitle>
          <Button variant="outline" size="sm" onClick={onApply}>
            Use this
          </Button>
        </div>
        <CardDescription>{value.length} variant{value.length !== 1 ? 's' : ''}</CardDescription>
      </CardHeader>
      <CardContent>
        {value.length === 0 ? (
          <p className="text-sm text-muted-foreground">No variants in suggestion.</p>
        ) : (
          <ul className="space-y-2">
            {value.map((variant) => (
              <li key={variant.id} className="rounded-md border border-border bg-surface-2 p-3">
                <p className="text-sm font-medium">{variant.name}</p>
                <p className="text-xs text-muted-foreground">{variant.description}</p>
                {Object.keys(variant.properties).length > 0 && (
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                    {Object.entries(variant.properties).map(([key, val]) => `${key}=${val}`).join(', ')}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export interface BestPracticesSuggestionCardProps {
  value: EditDocsBestPracticesValue;
  onApply: () => void;
}

export function BestPracticesSuggestionCard({ value, onApply }: BestPracticesSuggestionCardProps) {
  const hasItems = value.do.length > 0 || value.dont.length > 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Best Practices</CardTitle>
          <Button variant="outline" size="sm" onClick={onApply}>
            Use this
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!hasItems ? (
          <p className="text-sm text-muted-foreground">No best practices in suggestion.</p>
        ) : (
          <>
            <div>
              <p className="text-sm font-medium">Do</p>
              {value.do.length === 0 ? (
                <p className="text-sm text-muted-foreground">No do guidance.</p>
              ) : (
                <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                  {value.do.map((item, index) => <li key={index}>{item}</li>)}
                </ul>
              )}
            </div>
            <div>
              <p className="text-sm font-medium">Don't</p>
              {value.dont.length === 0 ? (
                <p className="text-sm text-muted-foreground">No don't guidance.</p>
              ) : (
                <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                  {value.dont.map((item, index) => <li key={index}>{item}</li>)}
                </ul>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export interface ContentGuidelinesSuggestionCardProps {
  value: string[];
  onApply: () => void;
}

export function ContentGuidelinesSuggestionCard({ value, onApply }: ContentGuidelinesSuggestionCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Content Guidelines</CardTitle>
          <Button variant="outline" size="sm" onClick={onApply}>
            Use this
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {value.length === 0 ? (
          <p className="text-sm text-muted-foreground">No content guidelines in suggestion.</p>
        ) : (
          <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
            {value.map((rule, index) => <li key={index}>{rule}</li>)}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export interface AccessibilitySuggestionCardProps {
  value: EditDocsAccessibilityValue;
  onApply: () => void;
}

export function AccessibilitySuggestionCard({ value, onApply }: AccessibilitySuggestionCardProps) {
  const hasAnything = Boolean(value.role) || value.labelingRules.length > 0 || value.notes.length > 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Accessibility</CardTitle>
          <Button variant="outline" size="sm" onClick={onApply}>
            Use this
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!hasAnything ? (
          <p className="text-sm text-muted-foreground">No accessibility guidance in suggestion.</p>
        ) : (
          <>
            <div>
              <p className="text-sm font-medium">Role</p>
              <p className="text-sm text-muted-foreground">{value.role || 'No role in suggestion.'}</p>
            </div>
            <div>
              <p className="text-sm font-medium">Labeling rules</p>
              {value.labelingRules.length === 0 ? (
                <p className="text-sm text-muted-foreground">No labeling rules in suggestion.</p>
              ) : (
                <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                  {value.labelingRules.map((rule, index) => <li key={index}>{rule}</li>)}
                </ul>
              )}
            </div>
            <div>
              <p className="text-sm font-medium">Notes</p>
              {value.notes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No accessibility notes in suggestion.</p>
              ) : (
                <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                  {value.notes.map((note, index) => <li key={index}>{note}</li>)}
                </ul>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

interface AiSuggestionsPanelProps {
  suggestion: AiSuggestionPayload;
  onApplySection: (action: FormDispatchAction) => void;
}

export function AiSuggestionsPanel({ suggestion, onApplySection }: AiSuggestionsPanelProps) {
  const handleApply = useCallback(
    (sectionId: SectionId) => {
      const value = SUGGESTION_SECTION_MAP[sectionId].extract(suggestion);
      switch (sectionId) {
        case 'summary':
          onApplySection({ type: 'SET_SUMMARY', payload: value as EditDocsSummaryValue });
          break;
        case 'variants':
          onApplySection({ type: 'SET_VARIANTS', payload: value as ComponentDocVariant[] });
          break;
        case 'bestPractices':
          onApplySection({ type: 'SET_BEST_PRACTICES', payload: value as EditDocsBestPracticesValue });
          break;
        case 'contentGuidelines':
          onApplySection({ type: 'SET_CONTENT_GUIDELINES', payload: value as string[] });
          break;
        case 'accessibility':
          onApplySection({ type: 'SET_ACCESSIBILITY', payload: value as EditDocsAccessibilityValue });
          break;
        default: {
          const _exhaustive: never = sectionId;
          void _exhaustive;
        }
      }
    },
    [suggestion, onApplySection],
  );

  return (
    <div className="space-y-4">
      <SummarySuggestionCard
        value={SUGGESTION_SECTION_MAP.summary.extract(suggestion) as EditDocsSummaryValue}
        onApply={() => handleApply('summary')}
      />
      <VariantsSuggestionCard
        value={SUGGESTION_SECTION_MAP.variants.extract(suggestion) as ComponentDocVariant[]}
        onApply={() => handleApply('variants')}
      />
      <BestPracticesSuggestionCard
        value={SUGGESTION_SECTION_MAP.bestPractices.extract(suggestion) as EditDocsBestPracticesValue}
        onApply={() => handleApply('bestPractices')}
      />
      <ContentGuidelinesSuggestionCard
        value={SUGGESTION_SECTION_MAP.contentGuidelines.extract(suggestion) as string[]}
        onApply={() => handleApply('contentGuidelines')}
      />
      <AccessibilitySuggestionCard
        value={SUGGESTION_SECTION_MAP.accessibility.extract(suggestion) as EditDocsAccessibilityValue}
        onApply={() => handleApply('accessibility')}
      />
    </div>
  );
}
