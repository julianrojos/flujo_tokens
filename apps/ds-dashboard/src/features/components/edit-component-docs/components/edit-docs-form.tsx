/**
 * EditDocsForm — editorial form for component documentation.
 *
 * Exports standalone form cards for the desktop layout and composes them for
 * mobile rendering.
 */

import { useCallback, useEffect, useId, useState } from 'react';
import type { ComponentDocVariant } from '@/types/ai-jobs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, X } from 'lucide-react';
import { normalizeStringList } from '../normalizers';

function createRowId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface EditDocsSummaryValue {
  purpose: string;
  whenToUse: string;
  whenNotToUse: string;
}

export interface EditDocsAccessibilityValue {
  role: string;
  guidance: string[];
}

export interface EditDocsFormData {
  summary: EditDocsSummaryValue;
  behaviour: string;
  variants: ComponentDocVariant[];
  contentGuidelines: string[];
  accessibility: EditDocsAccessibilityValue;
}

export interface SummaryFormCardProps {
  value: EditDocsSummaryValue;
  onChange: (v: EditDocsSummaryValue) => void;
}

export function SummaryFormCard({ value, onChange }: SummaryFormCardProps) {
  const purposeId = useId();
  const whenToUseId = useId();
  const whenNotToUseId = useId();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Summary</CardTitle>
        <CardDescription>Core purpose and decision guidance for the component</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <label htmlFor={purposeId} className="text-sm font-medium">Purpose</label>
          <textarea
            id={purposeId}
            className="min-h-[100px] w-full rounded border border-border bg-surface-2 px-3 py-2 text-sm"
            value={value.purpose}
            onChange={(e) => onChange({ ...value, purpose: e.target.value })}
            rows={4}
          />
        </div>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor={whenToUseId} className="text-sm font-medium">When to use</label>
            <textarea
              id={whenToUseId}
              className="min-h-[90px] w-full rounded border border-border bg-surface-2 px-3 py-2 text-sm"
              value={value.whenToUse}
              onChange={(e) => onChange({ ...value, whenToUse: e.target.value })}
              rows={3}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={whenNotToUseId} className="text-sm font-medium">When not to use</label>
            <textarea
              id={whenNotToUseId}
              className="min-h-[90px] w-full rounded border border-border bg-surface-2 px-3 py-2 text-sm"
              value={value.whenNotToUse}
              onChange={(e) => onChange({ ...value, whenNotToUse: e.target.value })}
              rows={3}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export interface BehaviourFormCardProps {
  value: string;
  onChange: (v: string) => void;
}

export function BehaviourFormCard({ value, onChange }: BehaviourFormCardProps) {
  const behaviourId = useId();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Behaviour</CardTitle>
        <CardDescription>What the component does when people interact with it</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        <label htmlFor={behaviourId} className="text-sm font-medium">Behaviour</label>
        <textarea
          id={behaviourId}
          className="min-h-[100px] w-full rounded border border-border bg-surface-2 px-3 py-2 text-sm"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
        />
      </CardContent>
    </Card>
  );
}

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
                    className="flex-1 rounded border border-border bg-surface-2 px-2 py-1 text-sm font-medium"
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
                  className="mb-2 w-full rounded border border-border bg-surface-2 px-2 py-1 text-sm"
                  value={v.description}
                  onChange={(e) => updateVariant(i, 'description', e.target.value)}
                  placeholder="Description"
                />
                <div className="space-y-1">
                  {Object.entries(v.properties).map(([k, val]) => (
                    <div key={k} className="flex gap-2">
                      <label htmlFor={`${variantsIdBase}-pk-${i}-${k}`} className="sr-only">Property key</label>
                      <input
                        id={`${variantsIdBase}-pk-${i}-${k}`}
                        className="w-24 rounded border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs"
                        value={k}
                        onChange={(e) => renameVariantProperty(i, k, e.target.value)}
                        placeholder="Key"
                      />
                      <label htmlFor={`${variantsIdBase}-pv-${i}-${k}`} className="sr-only">Property value</label>
                      <input
                        id={`${variantsIdBase}-pv-${i}-${k}`}
                        className="flex-1 rounded border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs"
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

interface StringListCardProps {
  title: string;
  description: string;
  value: string[];
  onChange: (v: string[]) => void;
  addLabel: string;
  emptyLabel: string;
  placeholder: string;
  itemLabel: (index: number) => string;
}

function useStringListRows(value: string[], onChange: (v: string[]) => void) {
  const idBase = useId();
  const [rowIds, setRowIds] = useState<string[]>(() => value.map(() => createRowId()));

  useEffect(() => {
    setRowIds((prev) => {
      if (prev.length === value.length) return prev;
      if (prev.length > value.length) return prev.slice(0, value.length);
      return [...prev, ...Array.from({ length: value.length - prev.length }, createRowId)];
    });
  }, [value.length]);

  const addItem = useCallback(() => {
    onChange([...value, '']);
    setRowIds((prev) => [...prev, createRowId()]);
  }, [value, onChange]);

  const updateItem = useCallback((index: number, fieldValue: string) => {
    const next = [...value];
    next[index] = fieldValue;
    onChange(next);
  }, [value, onChange]);

  const removeItem = useCallback((index: number) => {
    const next = value.filter((_, i) => i !== index);
    onChange(next);
    setRowIds((prev) => prev.filter((_, i) => i !== index));
  }, [value, onChange]);

  return { idBase, rowIds, addItem, updateItem, removeItem };
}

function StringListEditor({
  title,
  description,
  value,
  onChange,
  addLabel,
  emptyLabel,
  placeholder,
  itemLabel,
}: StringListCardProps) {
  const { idBase, rowIds, addItem, updateItem, removeItem } = useStringListRows(value, onChange);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-medium">{title}</p>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        <Button variant="outline" size="sm" onClick={addItem}>
          <Plus className="mr-1 h-4 w-4" /> {addLabel}
        </Button>
      </div>
      {value.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="space-y-2">
          {value.map((item, i) => (
            <li key={rowIds[i]} className="flex items-start gap-2">
              <label htmlFor={`${idBase}-${i}`} className="sr-only">{itemLabel(i)}</label>
              <textarea
                id={`${idBase}-${i}`}
                className="flex-1 rounded border border-border bg-surface-2 px-2 py-1 text-sm"
                value={item}
                onChange={(e) => updateItem(i, e.target.value)}
                rows={2}
                placeholder={placeholder}
              />
              <button
                type="button"
                className="mt-1 rounded p-1 text-muted-foreground hover:text-foreground"
                onClick={() => removeItem(i)}
                aria-label={`Remove ${title.toLowerCase()} item ${i + 1}`}
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StringListCard({
  title,
  description,
  value,
  onChange,
  addLabel,
  emptyLabel,
  placeholder,
  itemLabel,
}: StringListCardProps) {
  const { idBase, rowIds, addItem, updateItem, removeItem } = useStringListRows(value, onChange);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <Button variant="outline" size="sm" onClick={addItem}>
            <Plus className="mr-1 h-4 w-4" /> {addLabel}
          </Button>
        </div>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        {value.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          <ul className="space-y-2">
            {value.map((item, i) => (
              <li key={rowIds[i]} className="flex items-start gap-2">
                <label htmlFor={`${idBase}-${i}`} className="sr-only">{itemLabel(i)}</label>
                <textarea
                  id={`${idBase}-${i}`}
                  className="flex-1 rounded border border-border bg-surface-2 px-2 py-1 text-sm"
                  value={item}
                  onChange={(e) => updateItem(i, e.target.value)}
                  rows={2}
                  placeholder={placeholder}
                />
                <button
                  type="button"
                  className="mt-1 rounded p-1 text-muted-foreground hover:text-foreground"
                  onClick={() => removeItem(i)}
                  aria-label={`Remove ${title.toLowerCase()} item ${i + 1}`}
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

export interface ContentGuidelinesFormCardProps {
  value: string[];
  onChange: (v: string[]) => void;
}

export function ContentGuidelinesFormCard({ value, onChange }: ContentGuidelinesFormCardProps) {
  return (
    <StringListCard
      title="Content Guidelines"
      description=""
      value={value}
      onChange={onChange}
      addLabel="Add rule"
      emptyLabel="No content guidelines yet."
      placeholder="Guideline..."
      itemLabel={(index) => `Content guideline ${index + 1}`}
    />
  );
}

export interface AccessibilityFormCardProps {
  value: EditDocsAccessibilityValue;
  onChange: (v: EditDocsAccessibilityValue) => void;
}

const ARIA_ROLE_OPTIONS = {
  widget: [
    'button', 'checkbox', 'combobox', 'gridcell', 'link', 'menuitem', 'menuitemcheckbox',
    'menuitemradio', 'option', 'progressbar', 'radio', 'scrollbar', 'searchbox', 'separator',
    'slider', 'spinbutton', 'switch', 'tab', 'tabpanel', 'textbox', 'treeitem',
  ],
  composite: [
    'combobox', 'grid', 'listbox', 'menu', 'menubar', 'radiogroup', 'tablist', 'tree', 'treegrid',
  ],
  document: [
    'article', 'cell', 'code', 'columnheader', 'definition', 'deletion', 'directory', 'document',
    'emphasis', 'feed', 'figure', 'generic', 'group', 'heading', 'img', 'insertion', 'list',
    'listitem', 'math', 'meter', 'none', 'note', 'paragraph', 'presentation', 'row', 'rowgroup',
    'rowheader', 'separator', 'strong', 'subscript', 'superscript', 'table', 'term', 'time', 'toolbar',
  ],
  landmark: [
    'application', 'banner', 'complementary', 'contentinfo', 'form', 'main', 'navigation', 'region', 'search',
  ],
  liveRegion: ['alert', 'log', 'marquee', 'status', 'timer'],
  window: ['alertdialog', 'dialog', 'tooltip'],
} as const;

export function AccessibilityFormCard({ value, onChange }: AccessibilityFormCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Accessibility</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <label htmlFor="accessibility-role" className="text-sm font-medium">Role</label>
          <select
            id="accessibility-role"
            className="h-10 w-full rounded border border-border bg-surface-2 px-3 text-sm"
            value={value.role}
            onChange={(e) => onChange({ ...value, role: e.target.value })}
          >
            <option value="">Select a role</option>
            <optgroup label="Widget roles">
              {ARIA_ROLE_OPTIONS.widget.map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </optgroup>
            <optgroup label="Composite roles">
              {ARIA_ROLE_OPTIONS.composite.map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </optgroup>
            <optgroup label="Document structure roles">
              {ARIA_ROLE_OPTIONS.document.map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </optgroup>
            <optgroup label="Landmark roles">
              {ARIA_ROLE_OPTIONS.landmark.map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </optgroup>
            <optgroup label="Live region roles">
              {ARIA_ROLE_OPTIONS.liveRegion.map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </optgroup>
            <optgroup label="Window roles">
              {ARIA_ROLE_OPTIONS.window.map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </optgroup>
          </select>
        </div>

        <StringListEditor
          title="Accessibility Guidance"
          description=""
          value={value.guidance}
          onChange={(items) => onChange({ ...value, guidance: items })}
          addLabel="Add guidance"
          emptyLabel="No accessibility guidance yet."
          placeholder="Accessibility guidance..."
          itemLabel={(index) => `Accessibility guidance ${index + 1}`}
        />
      </CardContent>
    </Card>
  );
}

interface EditDocsFormProps {
  value: EditDocsFormData;
  onChange: (v: Partial<EditDocsFormData>) => void;
}

export function EditDocsForm({ value, onChange }: EditDocsFormProps) {
  return (
    <div className="space-y-4">
      <SummaryFormCard
        value={value.summary}
        onChange={(v) => onChange({ summary: v })}
      />
      <BehaviourFormCard
        value={value.behaviour}
        onChange={(v) => onChange({ behaviour: v })}
      />
      <AccessibilityFormCard
        value={value.accessibility}
        onChange={(v) => onChange({
          accessibility: {
            role: v.role,
            guidance: normalizeStringList(v.guidance),
          },
        })}
      />
      <ContentGuidelinesFormCard
        value={value.contentGuidelines}
        onChange={(v) => onChange({ contentGuidelines: normalizeStringList(v) })}
      />
      <VariantsFormCard
        value={value.variants}
        onChange={(v) => onChange({ variants: v })}
      />
    </div>
  );
}
