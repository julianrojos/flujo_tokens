/**
 * AiSuggestionsPanel — renders AI suggestion sections with "Use this" buttons.
 *
 * Each section is rendered structurally (not as markdown), with a "Use this"
 * button that applies the section value to the form via the dispatch callback.
 *
 * Exports four standalone *SuggestionCard components for use in the desktop
 * two-column layout, and composes them into AiSuggestionsPanel for mobile.
 */

import { useCallback } from 'react';
import type { ComponentDocOutput, ComponentDocVariant, ComponentDocToken } from '@/types/ai-jobs';
import type { TokenRegistry } from '@/types/token-registry';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { resolveVariableRef, formatVariableRef } from '@/lib/token-reference';
import { SUGGESTION_SECTION_MAP, type SectionId, type FormDispatchAction } from '../constants/suggestion-section-map';

// ─── SummarySuggestionCard ──────────────────────────────────────────────

export interface SummarySuggestionCardProps {
  value: string;
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
      <CardContent>
        <p className="text-sm text-muted-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}

// ─── VariantsSuggestionCard ─────────────────────────────────────────────

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
            {value.map((v) => (
              <li key={v.id} className="rounded-md border border-border bg-surface-2 p-3">
                <p className="text-sm font-medium">{v.name}</p>
                <p className="text-xs text-muted-foreground">{v.description}</p>
                {Object.keys(v.properties).length > 0 && (
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                    {Object.entries(v.properties).map(([k, val]) => `${k}=${val}`).join(', ')}
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

// ─── TokensSuggestionCard ───────────────────────────────────────────────

export interface TokensSuggestionCardProps {
  value: ComponentDocToken[];
  onApply: () => void;
  tokenRegistry: TokenRegistry;
}

export function TokensSuggestionCard({ value, onApply, tokenRegistry }: TokensSuggestionCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Tokens</CardTitle>
          <Button variant="outline" size="sm" onClick={onApply}>
            Use this
          </Button>
        </div>
        <CardDescription>{value.length} token{value.length !== 1 ? 's' : ''}</CardDescription>
      </CardHeader>
      <CardContent>
        {value.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tokens in suggestion.</p>
        ) : (
          <ul className="space-y-1">
            {value.map((t, i) => {
              const displayName = t.name;
              const displayValue = formatVariableRef(resolveVariableRef(t.value, tokenRegistry));
              return (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{displayName}</code>
                  <span className="text-muted-foreground">{displayValue}</span>
                  <span className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {t.type}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ─── AccessibilitySuggestionCard ────────────────────────────────────────

export interface AccessibilitySuggestionCardProps {
  value: string[];
  onApply: () => void;
}

export function AccessibilitySuggestionCard({ value, onApply }: AccessibilitySuggestionCardProps) {
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
      <CardContent>
        {value.length === 0 ? (
          <p className="text-sm text-muted-foreground">No accessibility notes in suggestion.</p>
        ) : (
          <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
            {value.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ─── AiSuggestionsPanel (mobile wrapper) ────────────────────────────────

interface AiSuggestionsPanelProps {
  suggestion: ComponentDocOutput;
  onApplySection: (action: FormDispatchAction) => void;
  tokenRegistry: TokenRegistry;
}

export function AiSuggestionsPanel({ suggestion, onApplySection, tokenRegistry }: AiSuggestionsPanelProps) {
  const handleApply = useCallback(
    (sectionId: SectionId) => {
      const def = SUGGESTION_SECTION_MAP[sectionId];
      if (!def) return;
      const value = def.extract(suggestion);
      switch (sectionId) {
        case 'summary':
          onApplySection({ type: 'SET_SUMMARY', payload: String(value ?? '') });
          break;
        case 'variants':
          onApplySection({ type: 'SET_VARIANTS', payload: (value as ComponentDocVariant[]) ?? [] });
          break;
        case 'tokens':
          onApplySection({ type: 'SET_TOKENS', payload: (value as ComponentDocToken[]) ?? [] });
          break;
        case 'accessibilityNotes':
          onApplySection({ type: 'SET_ACC_NOTES', payload: (value as string[]) ?? [] });
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
        value={suggestion.summary}
        onApply={() => handleApply('summary')}
      />
      <VariantsSuggestionCard
        value={suggestion.variants}
        onApply={() => handleApply('variants')}
      />
      <TokensSuggestionCard
        value={suggestion.tokens}
        onApply={() => handleApply('tokens')}
        tokenRegistry={tokenRegistry}
      />
      <AccessibilitySuggestionCard
        value={suggestion.accessibilityNotes}
        onApply={() => handleApply('accessibilityNotes')}
      />
    </div>
  );
}
