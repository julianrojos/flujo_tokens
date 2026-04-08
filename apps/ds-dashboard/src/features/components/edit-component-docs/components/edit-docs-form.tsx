/**
 * EditDocsForm — editorial form with summary, variants, tokens, and accessibility.
 *
 * Exports four standalone *FormCard components for use in the desktop
 * two-column layout, and composes them into EditDocsForm for mobile.
 */

import { useCallback, useEffect, useId, useState } from 'react';
import type { ComponentDocVariant, ComponentDocToken } from '@/types/ai-jobs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, X } from 'lucide-react';

// ─── Shared utility ────────────────────────────────────────────────────

function createRowId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Data interfaces ────────────────────────────────────────────────────

interface EditDocsFormData {
  summary: string;
  variants: ComponentDocVariant[];
  tokens: ComponentDocToken[];
  accessibilityNotes: string[];
}

// ─── SummaryFormCard ────────────────────────────────────────────────────

export interface SummaryFormCardProps {
  value: string;
  onChange: (v: string) => void;
}

export function SummaryFormCard({ value, onChange }: SummaryFormCardProps) {
  const summaryId = useId();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Summary</CardTitle>
        <CardDescription>Brief description of the component</CardDescription>
      </CardHeader>
      <CardContent>
        <label htmlFor={summaryId} className="sr-only">Summary</label>
        <textarea
          id={summaryId}
          className="w-full min-h-[120px] rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
          placeholder="Component purpose and usage..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </CardContent>
    </Card>
  );
}

// ─── VariantsFormCard ───────────────────────────────────────────────────

export interface VariantsFormCardProps {
  value: ComponentDocVariant[];
  onChange: (v: ComponentDocVariant[]) => void;
}

export function VariantsFormCard({ value: variants, onChange }: VariantsFormCardProps) {
  const variantsIdBase = useId();
  const [variantRowIds, setVariantRowIds] = useState<string[]>(() => variants.map(() => createRowId()));

  useEffect(() => {
    setVariantRowIds((prev) => {
      if (prev.length === variants.length) return prev;
      if (prev.length > variants.length) return prev.slice(0, variants.length);
      return [...prev, ...Array.from({ length: variants.length - prev.length }, createRowId)];
    });
  }, [variants.length]);

  const addVariant = useCallback(() => {
    const id = createRowId();
    onChange([...variants, { id, name: '', description: '', properties: {} }]);
    setVariantRowIds((prev) => [...prev, id]);
  }, [variants, onChange]);

  const updateVariant = useCallback((index: number, field: keyof ComponentDocVariant, fieldValue: unknown) => {
    onChange(variants.map((v, i) => i === index ? { ...v, [field]: fieldValue } : v));
  }, [variants, onChange]);

  const removeVariant = useCallback((index: number) => {
    onChange(variants.filter((_, i) => i !== index));
    setVariantRowIds((prev) => prev.filter((_, i) => i !== index));
  }, [variants, onChange]);

  const formatVariantProperties = useCallback((properties: Record<string, string>): string => {
    return Object.entries(properties)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
  }, []);

  const parseVariantProperties = useCallback((raw: string): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex <= 0) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      if (!key) continue;
      out[key] = value;
    }
    return out;
  }, []);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Variants</CardTitle>
            <CardDescription>{variants.length} variant{variants.length !== 1 ? 's' : ''}</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={addVariant} aria-label="Add variant">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {variants.length === 0 ? (
          <p className="text-sm text-muted-foreground">No variants defined yet.</p>
        ) : (
          <ul className="space-y-3">
            {variants.map((v, idx) => (
              <li key={variantRowIds[idx] ?? `variant-${idx}`} className="rounded-md border border-border bg-surface-2 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <label htmlFor={`${variantsIdBase}-name-${variantRowIds[idx] ?? idx}`} className="sr-only">
                    Variant name {idx + 1}
                  </label>
                  <Input
                    id={`${variantsIdBase}-name-${variantRowIds[idx] ?? idx}`}
                    className="flex-1 text-sm"
                    placeholder="Variant name"
                    value={v.name}
                    onChange={(e) => updateVariant(idx, 'name', e.target.value)}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeVariant(idx)}
                    className="shrink-0"
                    aria-label={`Remove variant ${idx + 1}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <label htmlFor={`${variantsIdBase}-description-${variantRowIds[idx] ?? idx}`} className="sr-only">
                  Variant description {idx + 1}
                </label>
                <textarea
                  id={`${variantsIdBase}-description-${variantRowIds[idx] ?? idx}`}
                  className="w-full rounded-md border border-border bg-surface-1 px-2 py-1.5 text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent/50"
                  placeholder="Description..."
                  value={v.description}
                  onChange={(e) => updateVariant(idx, 'description', e.target.value)}
                />
                <label htmlFor={`${variantsIdBase}-properties-${variantRowIds[idx] ?? idx}`} className="sr-only">
                  Variant properties {idx + 1}
                </label>
                <textarea
                  id={`${variantsIdBase}-properties-${variantRowIds[idx] ?? idx}`}
                  className="w-full rounded-md border border-border bg-surface-1 px-2 py-1.5 font-mono text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent/50"
                  placeholder={'Properties (one per line)\nvariant=primary\nstate=default'}
                  value={formatVariantProperties(v.properties)}
                  onChange={(e) => updateVariant(idx, 'properties', parseVariantProperties(e.target.value))}
                />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ─── TokensFormCard ─────────────────────────────────────────────────────

export interface TokensFormCardProps {
  value: ComponentDocToken[];
  onChange: (v: ComponentDocToken[]) => void;
}

export function TokensFormCard({ value: tokens, onChange }: TokensFormCardProps) {
  const tokensIdBase = useId();
  const [tokenRowIds, setTokenRowIds] = useState<string[]>(() => tokens.map(() => createRowId()));

  useEffect(() => {
    setTokenRowIds((prev) => {
      if (prev.length === tokens.length) return prev;
      if (prev.length > tokens.length) return prev.slice(0, tokens.length);
      return [...prev, ...Array.from({ length: tokens.length - prev.length }, createRowId)];
    });
  }, [tokens.length]);

  const addToken = useCallback(() => {
    onChange([...tokens, { name: '', value: '', type: 'color' }]);
    setTokenRowIds((prev) => [...prev, createRowId()]);
  }, [tokens, onChange]);

  const updateToken = useCallback((index: number, field: keyof ComponentDocToken, fieldValue: unknown) => {
    onChange(tokens.map((t, i) => i === index ? { ...t, [field]: fieldValue } : t));
  }, [tokens, onChange]);

  const removeToken = useCallback((index: number) => {
    onChange(tokens.filter((_, i) => i !== index));
    setTokenRowIds((prev) => prev.filter((_, i) => i !== index));
  }, [tokens, onChange]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Tokens</CardTitle>
            <CardDescription>{tokens.length} token{tokens.length !== 1 ? 's' : ''}</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={addToken} aria-label="Add token">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {tokens.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tokens defined yet.</p>
        ) : (
          <ul className="space-y-2">
            {tokens.map((t, idx) => (
              <li key={tokenRowIds[idx] ?? `token-${idx}`} className="flex items-center gap-2">
                <label htmlFor={`${tokensIdBase}-name-${tokenRowIds[idx] ?? idx}`} className="sr-only">
                  Token name {idx + 1}
                </label>
                <Input
                  id={`${tokensIdBase}-name-${tokenRowIds[idx] ?? idx}`}
                  className="flex-1 font-mono text-xs"
                  placeholder="Token name"
                  value={t.name}
                  onChange={(e) => updateToken(idx, 'name', e.target.value)}
                />
                <label htmlFor={`${tokensIdBase}-value-${tokenRowIds[idx] ?? idx}`} className="sr-only">
                  Token value {idx + 1}
                </label>
                <Input
                  id={`${tokensIdBase}-value-${tokenRowIds[idx] ?? idx}`}
                  className="flex-1 text-xs"
                  placeholder="Value"
                  value={t.value}
                  onChange={(e) => updateToken(idx, 'value', e.target.value)}
                />
                <label htmlFor={`${tokensIdBase}-type-${tokenRowIds[idx] ?? idx}`} className="sr-only">
                  Token type {idx + 1}
                </label>
                <select
                  id={`${tokensIdBase}-type-${tokenRowIds[idx] ?? idx}`}
                  className="rounded-md border border-border bg-surface-2 px-2 py-1.5 text-xs text-foreground"
                  value={t.type}
                  onChange={(e) => updateToken(idx, 'type', e.target.value)}
                >
                  <option value="color">color</option>
                  <option value="spacing">spacing</option>
                  <option value="typography">typography</option>
                  <option value="border">border</option>
                  <option value="shadow">shadow</option>
                  <option value="other">other</option>
                </select>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeToken(idx)}
                  className="shrink-0"
                  aria-label={`Remove token ${idx + 1}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ─── AccessibilityFormCard ──────────────────────────────────────────────

export interface AccessibilityFormCardProps {
  value: string[];
  onChange: (v: string[]) => void;
}

export function AccessibilityFormCard({ value: notes, onChange }: AccessibilityFormCardProps) {
  const notesIdBase = useId();
  const [noteRowIds, setNoteRowIds] = useState<string[]>(() => notes.map(() => createRowId()));

  useEffect(() => {
    setNoteRowIds((prev) => {
      if (prev.length === notes.length) return prev;
      if (prev.length > notes.length) return prev.slice(0, notes.length);
      return [...prev, ...Array.from({ length: notes.length - prev.length }, createRowId)];
    });
  }, [notes.length]);

  const addNote = useCallback(() => {
    onChange([...notes, '']);
    setNoteRowIds((prev) => [...prev, createRowId()]);
  }, [notes, onChange]);

  const updateNote = useCallback((index: number, fieldValue: string) => {
    onChange(notes.map((n, i) => i === index ? fieldValue : n));
  }, [notes, onChange]);

  const removeNote = useCallback((index: number) => {
    onChange(notes.filter((_, i) => i !== index));
    setNoteRowIds((prev) => prev.filter((_, i) => i !== index));
  }, [notes, onChange]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Accessibility</CardTitle>
            <CardDescription>Accessibility considerations</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={addNote} aria-label="Add accessibility note">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No accessibility notes yet.</p>
        ) : (
          <ul className="space-y-2">
            {notes.map((note, idx) => (
              <li key={noteRowIds[idx] ?? `note-${idx}`} className="flex items-center gap-2">
                <label htmlFor={`${notesIdBase}-note-${noteRowIds[idx] ?? idx}`} className="sr-only">
                  Accessibility note {idx + 1}
                </label>
                <Input
                  id={`${notesIdBase}-note-${noteRowIds[idx] ?? idx}`}
                  className="flex-1 text-sm"
                  placeholder="Accessibility consideration..."
                  value={note}
                  onChange={(e) => updateNote(idx, e.target.value)}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeNote(idx)}
                  className="shrink-0"
                  aria-label={`Remove accessibility note ${idx + 1}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ─── EditDocsForm (mobile wrapper) ─────────────────────────────────────

interface EditDocsFormProps {
  value: EditDocsFormData;
  onChange: (data: EditDocsFormData) => void;
}

export function EditDocsForm({ value, onChange }: EditDocsFormProps) {
  return (
    <div className="space-y-6">
      <SummaryFormCard value={value.summary} onChange={(v) => onChange({ ...value, summary: v })} />
      <VariantsFormCard value={value.variants} onChange={(v) => onChange({ ...value, variants: v })} />
      <TokensFormCard value={value.tokens} onChange={(v) => onChange({ ...value, tokens: v })} />
      <AccessibilityFormCard value={value.accessibilityNotes} onChange={(v) => onChange({ ...value, accessibilityNotes: v })} />
    </div>
  );
}
