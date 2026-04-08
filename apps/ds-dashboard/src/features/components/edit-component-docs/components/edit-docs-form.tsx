/**
 * EditDocsForm — editorial form with summary, variants, tokens, and accessibility.
 */

import { useCallback, useEffect, useState } from 'react';
import type { ComponentDocVariant, ComponentDocToken } from '@/types/ai-jobs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, X } from 'lucide-react';

interface EditDocsFormData {
  summary: string;
  variants: ComponentDocVariant[];
  tokens: ComponentDocToken[];
  accessibilityNotes: string[];
}

interface EditDocsFormProps {
  value: EditDocsFormData;
  onChange: (data: EditDocsFormData) => void;
}

export function EditDocsForm({ value: data, onChange }: EditDocsFormProps) {
  const createRowId = useCallback((): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }, []);

  const [tokenRowIds, setTokenRowIds] = useState<string[]>(() => data.tokens.map(() => createRowId()));
  const [noteRowIds, setNoteRowIds] = useState<string[]>(() => data.accessibilityNotes.map(() => createRowId()));
  const [variantRowIds, setVariantRowIds] = useState<string[]>(() => data.variants.map(() => createRowId()));

  useEffect(() => {
    setVariantRowIds((prev) => {
      if (prev.length === data.variants.length) return prev;
      if (prev.length > data.variants.length) return prev.slice(0, data.variants.length);
      return [...prev, ...Array.from({ length: data.variants.length - prev.length }, () => createRowId())];
    });
  }, [data.variants.length, createRowId]);

  useEffect(() => {
    setTokenRowIds((prev) => {
      if (prev.length === data.tokens.length) return prev;
      if (prev.length > data.tokens.length) return prev.slice(0, data.tokens.length);
      return [...prev, ...Array.from({ length: data.tokens.length - prev.length }, () => createRowId())];
    });
  }, [data.tokens.length, createRowId]);

  useEffect(() => {
    setNoteRowIds((prev) => {
      if (prev.length === data.accessibilityNotes.length) return prev;
      if (prev.length > data.accessibilityNotes.length) return prev.slice(0, data.accessibilityNotes.length);
      return [...prev, ...Array.from({ length: data.accessibilityNotes.length - prev.length }, () => createRowId())];
    });
  }, [data.accessibilityNotes.length, createRowId]);

  const updateField = useCallback(
    <K extends keyof EditDocsFormData>(field: K, value: EditDocsFormData[K]) => {
      const next = { ...data, [field]: value };
      onChange(next);
    },
    [data, onChange],
  );

  // --- Variant helpers ---
  const addVariant = useCallback(() => {
    updateField('variants', [...data.variants, { id: createRowId(), name: '', description: '', properties: {} }]);
    setVariantRowIds((prev) => [...prev, createRowId()]);
  }, [createRowId, data.variants, updateField]);

  const updateVariant = useCallback((index: number, field: keyof ComponentDocVariant, value: unknown) => {
    updateField('variants', data.variants.map((v, i) => i === index ? { ...v, [field]: value } : v));
  }, [data.variants, updateField]);

  const removeVariant = useCallback((index: number) => {
    updateField('variants', data.variants.filter((_, i) => i !== index));
    setVariantRowIds((prev) => prev.filter((_, i) => i !== index));
  }, [data.variants, updateField]);

  // --- Token helpers ---
  const addToken = useCallback(() => {
    updateField('tokens', [...data.tokens, { name: '', value: '', type: 'color' }]);
    setTokenRowIds((prev) => [...prev, createRowId()]);
  }, [createRowId, data.tokens, updateField]);

  const updateToken = useCallback((index: number, field: keyof ComponentDocToken, value: unknown) => {
    updateField('tokens', data.tokens.map((t, i) => i === index ? { ...t, [field]: value } : t));
  }, [data.tokens, updateField]);

  const removeToken = useCallback((index: number) => {
    updateField('tokens', data.tokens.filter((_, i) => i !== index));
    setTokenRowIds((prev) => prev.filter((_, i) => i !== index));
  }, [data.tokens, updateField]);

  // --- Accessibility note helpers ---
  const addAccessibilityNote = useCallback(() => {
    updateField('accessibilityNotes', [...data.accessibilityNotes, '']);
    setNoteRowIds((prev) => [...prev, createRowId()]);
  }, [createRowId, data.accessibilityNotes, updateField]);

  const updateAccessibilityNote = useCallback((index: number, value: string) => {
    updateField('accessibilityNotes', data.accessibilityNotes.map((n, i) => i === index ? value : n));
  }, [data.accessibilityNotes, updateField]);

  const removeAccessibilityNote = useCallback((index: number) => {
    updateField('accessibilityNotes', data.accessibilityNotes.filter((_, i) => i !== index));
    setNoteRowIds((prev) => prev.filter((_, i) => i !== index));
  }, [data.accessibilityNotes, updateField]);

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
    <div className="space-y-6">
      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Summary</CardTitle>
          <CardDescription>Brief description of the component</CardDescription>
        </CardHeader>
        <CardContent>
          <textarea
            className="w-full min-h-[120px] rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
            placeholder="Component purpose and usage..."
            value={data.summary}
            onChange={(e) => updateField('summary', e.target.value)}
          />
        </CardContent>
      </Card>

      {/* Variants */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Variants</CardTitle>
              <CardDescription>{data.variants.length} variant{data.variants.length !== 1 ? 's' : ''}</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={addVariant}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {data.variants.length === 0 ? (
            <p className="text-sm text-muted-foreground">No variants defined yet.</p>
          ) : (
            <ul className="space-y-3">
              {data.variants.map((v, idx) => (
                <li key={variantRowIds[idx] ?? `variant-${idx}`} className="rounded-md border border-border bg-surface-2 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      className="flex-1 text-sm"
                      placeholder="Variant name"
                      value={v.name}
                      onChange={(e) => updateVariant(idx, 'name', e.target.value)}
                    />
                    <Button variant="ghost" size="sm" onClick={() => removeVariant(idx)} className="shrink-0">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <textarea
                    className="w-full rounded-md border border-border bg-surface-1 px-2 py-1.5 text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent/50"
                    placeholder="Description..."
                    value={v.description}
                    onChange={(e) => updateVariant(idx, 'description', e.target.value)}
                  />
                  <textarea
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

      {/* Tokens */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Tokens</CardTitle>
              <CardDescription>{data.tokens.length} token{data.tokens.length !== 1 ? 's' : ''}</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={addToken}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {data.tokens.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tokens defined yet.</p>
          ) : (
            <ul className="space-y-2">
              {data.tokens.map((t, idx) => (
                <li key={tokenRowIds[idx] ?? `token-${idx}`} className="flex items-center gap-2">
                  <Input
                    className="flex-1 font-mono text-xs"
                    placeholder="Token name"
                    value={t.name}
                    onChange={(e) => updateToken(idx, 'name', e.target.value)}
                  />
                  <Input
                    className="flex-1 text-xs"
                    placeholder="Value"
                    value={t.value}
                    onChange={(e) => updateToken(idx, 'value', e.target.value)}
                  />
                  <select
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
                  <Button variant="ghost" size="sm" onClick={() => removeToken(idx)} className="shrink-0">
                    <X className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Accessibility */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Accessibility</CardTitle>
              <CardDescription>Accessibility considerations</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={addAccessibilityNote}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {data.accessibilityNotes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No accessibility notes yet.</p>
          ) : (
            <ul className="space-y-2">
              {data.accessibilityNotes.map((note, idx) => (
                <li key={noteRowIds[idx] ?? `note-${idx}`} className="flex items-center gap-2">
                  <Input
                    className="flex-1 text-sm"
                    placeholder="Accessibility consideration..."
                    value={note}
                    onChange={(e) => updateAccessibilityNote(idx, e.target.value)}
                  />
                  <Button variant="ghost" size="sm" onClick={() => removeAccessibilityNote(idx)} className="shrink-0">
                    <X className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
