/**
 * EditDocsForm — editorial form with summary, variants, and accessibility.
 *
 * Exports three standalone *FormCard components for use in the desktop
 * two-column layout, and composes them into EditDocsForm for mobile.
 */

import { useCallback, useEffect, useId, useState } from 'react';
import type { ComponentDocVariant } from '@/types/ai-jobs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
          className="min-h-[100px] w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
        />
      </CardContent>
    </Card>
  );
}

// ─── VariantsFormCard ─────────────────────────────────────────────────

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
    onChange([...variants, { id: createRowId(), name: '', description: '', properties: {} }]);
    setVariantRowIds((prev) => [...prev, createRowId()]);
  }, [variants, onChange]);

  const updateVariant = useCallback((index: number, field: keyof ComponentDocVariant, fieldValue: unknown) => {
    const next = [...variants];
    next[index] = { ...next[index], [field]: fieldValue };
    onChange(next);
  }, [variants, onChange]);

  const updateVariantProperty = useCallback((variantIndex: number, propKey: string, propValue: string) => {
    const next = [...variants];
    const props = { ...next[variantIndex].properties };
    props[propKey] = propValue;
    next[variantIndex] = { ...next[variantIndex], properties: props };
    onChange(next);
  }, [variants, onChange]);

  const addVariantProperty = useCallback((variantIndex: number) => {
    const next = [...variants];
    const props = { ...next[variantIndex].properties };
    let suffix = 1;
    let candidate = 'property';
    while (candidate in props) {
      suffix += 1;
      candidate = `property-${suffix}`;
    }
    props[candidate] = '';
    next[variantIndex] = { ...next[variantIndex], properties: props };
    onChange(next);
  }, [variants, onChange]);

  const renameVariantProperty = useCallback((variantIndex: number, currentKey: string, nextKeyRaw: string) => {
    const nextKey = nextKeyRaw.trim();
    if (!nextKey || nextKey === currentKey) return;

    const next = [...variants];
    const props = { ...next[variantIndex].properties };
    if (nextKey in props) return;

    const currentValue = props[currentKey];
    delete props[currentKey];
    props[nextKey] = currentValue;
    next[variantIndex] = { ...next[variantIndex], properties: props };
    onChange(next);
  }, [variants, onChange]);

  const removeVariantProperty = useCallback((variantIndex: number, propKey: string) => {
    const next = [...variants];
    const props = { ...next[variantIndex].properties };
    delete props[propKey];
    next[variantIndex] = { ...next[variantIndex], properties: props };
    onChange(next);
  }, [variants, onChange]);

  const removeVariant = useCallback((index: number) => {
    const next = variants.filter((_, i) => i !== index);
    onChange(next);
    setVariantRowIds((prev) => prev.filter((_, i) => i !== index));
  }, [variants, onChange]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Variants</CardTitle>
          <Button variant="outline" size="sm" onClick={addVariant}>
            <Plus className="mr-1 h-4 w-4" /> Add variant
          </Button>
        </div>
        <CardDescription>{variants.length} variant{variants.length !== 1 ? 's' : ''}</CardDescription>
      </CardHeader>
      <CardContent>
        {variants.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No variants yet.</p>
        ) : (
          <ul className="space-y-3">
            {variants.map((v, i) => (
              <li key={variantRowIds[i]} className="rounded-md border border-border bg-surface-2 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <label htmlFor={`${variantsIdBase}-name-${i}`} className="sr-only">Variant name</label>
                  <input
                    id={`${variantsIdBase}-name-${i}`}
                    className="flex-1 rounded-md border border-border bg-surface-1 px-2 py-1 text-sm font-medium"
                    value={v.name}
                    onChange={(e) => updateVariant(i, 'name', e.target.value)}
                    placeholder="Variant name"
                  />
                  <button
                    type="button"
                    className="ml-2 rounded p-1 text-muted-foreground hover:text-foreground"
                    onClick={() => removeVariant(i)}
                    aria-label={`Remove variant ${v.name || i + 1}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <label htmlFor={`${variantsIdBase}-desc-${i}`} className="sr-only">Description</label>
                <input
                  id={`${variantsIdBase}-desc-${i}`}
                  className="mb-2 w-full rounded-md border border-border bg-surface-1 px-2 py-1 text-sm"
                  value={v.description}
                  onChange={(e) => updateVariant(i, 'description', e.target.value)}
                  placeholder="Description"
                />
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Properties</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => addVariantProperty(i)}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" /> Add property
                    </Button>
                  </div>
                  {Object.entries(v.properties).map(([k, val]) => (
                    <div key={k} className="flex gap-2">
                      <label htmlFor={`${variantsIdBase}-pk-${i}-${k}`} className="sr-only">Property key</label>
                      <input
                        id={`${variantsIdBase}-pk-${i}-${k}`}
                        className="w-24 rounded border border-border bg-surface-1 px-2 py-0.5 font-mono text-xs"
                        value={k}
                        onChange={(e) => renameVariantProperty(i, k, e.target.value)}
                        placeholder="Key"
                      />
                      <label htmlFor={`${variantsIdBase}-pv-${i}-${k}`} className="sr-only">Property value</label>
                      <input
                        id={`${variantsIdBase}-pv-${i}-${k}`}
                        className="flex-1 rounded border border-border bg-surface-1 px-2 py-0.5 font-mono text-xs"
                        value={val}
                        onChange={(e) => updateVariantProperty(i, k, e.target.value)}
                        placeholder="Value"
                      />
                      <button
                        type="button"
                        className="rounded p-1 text-muted-foreground hover:text-foreground"
                        onClick={() => removeVariantProperty(i, k)}
                        aria-label={`Remove property ${k || 'entry'} from variant ${v.name || i + 1}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ─── AccessibilityFormCard ────────────────────────────────────────────

export interface AccessibilityFormCardProps {
  value: string[];
  onChange: (v: string[]) => void;
}

export function AccessibilityFormCard({ value, onChange }: AccessibilityFormCardProps) {
  const accIdBase = useId();
  const [noteRowIds, setNoteRowIds] = useState<string[]>(() => value.map(() => createRowId()));

  useEffect(() => {
    setNoteRowIds((prev) => {
      if (prev.length === value.length) return prev;
      if (prev.length > value.length) return prev.slice(0, value.length);
      return [...prev, ...Array.from({ length: value.length - prev.length }, createRowId)];
    });
  }, [value.length]);

  const addNote = useCallback(() => {
    onChange([...value, '']);
    setNoteRowIds((prev) => [...prev, createRowId()]);
  }, [value, onChange]);

  const updateNote = useCallback((index: number, fieldValue: string) => {
    const next = [...value];
    next[index] = fieldValue;
    onChange(next);
  }, [value, onChange]);

  const removeNote = useCallback((index: number) => {
    const next = value.filter((_, i) => i !== index);
    onChange(next);
    setNoteRowIds((prev) => prev.filter((_, i) => i !== index));
  }, [value, onChange]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Accessibility</CardTitle>
          <Button variant="outline" size="sm" onClick={addNote}>
            <Plus className="mr-1 h-4 w-4" /> Add note
          </Button>
        </div>
        <CardDescription>{value.length} note{value.length !== 1 ? 's' : ''}</CardDescription>
      </CardHeader>
      <CardContent>
        {value.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No accessibility notes yet.</p>
        ) : (
          <ul className="space-y-2">
            {value.map((note, i) => (
              <li key={noteRowIds[i]} className="flex items-start gap-2">
                <label htmlFor={`${accIdBase}-note-${i}`} className="sr-only">Accessibility note {i + 1}</label>
                <textarea
                  id={`${accIdBase}-note-${i}`}
                  className="flex-1 rounded-md border border-border bg-surface-2 px-2 py-1 text-sm"
                  value={note}
                  onChange={(e) => updateNote(i, e.target.value)}
                  rows={2}
                  placeholder="Accessibility consideration..."
                />
                <button
                  type="button"
                  className="mt-1 rounded p-1 text-muted-foreground hover:text-foreground"
                  onClick={() => removeNote(i)}
                  aria-label={`Remove note ${i + 1}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ─── EditDocsForm (mobile wrapper) ────────────────────────────────────

interface EditDocsFormProps {
  formData: EditDocsFormData;
  onChange: (v: Partial<EditDocsFormData>) => void;
}

export function EditDocsForm({ formData, onChange }: EditDocsFormProps) {
  return (
    <div className="space-y-4">
      <SummaryFormCard
        value={formData.summary}
        onChange={(v) => onChange({ summary: v })}
      />
      <VariantsFormCard
        value={formData.variants}
        onChange={(v) => onChange({ variants: v })}
      />
      <AccessibilityFormCard
        value={formData.accessibilityNotes}
        onChange={(v) => onChange({ accessibilityNotes: v })}
      />
    </div>
  );
}
