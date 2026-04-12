/**
 * EditDocsForm — editorial form for component documentation.
 *
 * Exports standalone form cards for the desktop layout and composes them for
 * mobile rendering.
 */

import { useCallback, useEffect, useId, useState } from 'react';
import type { SpecProperty } from 'ds-types';
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
  labelingRules: string[];
  notes: string[];
}

export interface EditDocsFormData {
  summary: EditDocsSummaryValue;
  properties: SpecProperty[];
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
            className="min-h-[100px] w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm"
            value={value.purpose}
            onChange={(e) => onChange({ ...value, purpose: e.target.value })}
            rows={4}
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor={whenToUseId} className="text-sm font-medium">When to use</label>
            <textarea
              id={whenToUseId}
              className="min-h-[90px] w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm"
              value={value.whenToUse}
              onChange={(e) => onChange({ ...value, whenToUse: e.target.value })}
              rows={3}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={whenNotToUseId} className="text-sm font-medium">When not to use</label>
            <textarea
              id={whenNotToUseId}
              className="min-h-[90px] w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm"
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

export interface PropertiesFormCardProps {
  value: SpecProperty[];
  onChange: (v: SpecProperty[]) => void;
}

function createEmptyProperty(_index: number): SpecProperty {
  return {
    name: '',
    type: 'text',
    values: [],
    default: '',
    required: false,
    description: '',
  };
}

export function PropertiesFormCard({ value: properties, onChange }: PropertiesFormCardProps) {
  const propsIdBase = useId();
  const [rowIds, setRowIds] = useState<string[]>(() => properties.map(() => createRowId()));

  useEffect(() => {
    setRowIds((prev) => {
      if (prev.length === properties.length) return prev;
      if (prev.length > properties.length) return prev.slice(0, properties.length);
      return [...prev, ...Array.from({ length: properties.length - prev.length }, createRowId)];
    });
  }, [properties.length]);

  const addProperty = useCallback(() => {
    onChange([...properties, createEmptyProperty(properties.length + 1)]);
    setRowIds((prev) => [...prev, createRowId()]);
  }, [properties, onChange]);

  const updateProperty = useCallback((index: number, nextValue: Partial<SpecProperty>) => {
    const next = [...properties];
    next[index] = { ...next[index], ...nextValue };
    onChange(next);
  }, [properties, onChange]);

  const removeProperty = useCallback((index: number) => {
    onChange(properties.filter((_, i) => i !== index));
    setRowIds((prev) => prev.filter((_, i) => i !== index));
  }, [properties, onChange]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Properties</CardTitle>
          <Button variant="outline" size="sm" onClick={addProperty}>
            <Plus className="mr-1 h-4 w-4" /> Add property
          </Button>
        </div>
        <CardDescription>{properties.length} top-level propert{properties.length === 1 ? 'y' : 'ies'}</CardDescription>
      </CardHeader>
      <CardContent>
        {properties.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No top-level properties yet.</p>
        ) : (
          <ul className="space-y-3">
            {properties.map((property, index) => (
              <li key={rowIds[index]} className="rounded-md border border-border bg-surface-2 p-3 space-y-2">
                <div className="grid gap-2 md:grid-cols-[minmax(0,1fr),140px,120px,120px,auto] md:items-end">
                  <div className="space-y-1">
                    <label htmlFor={`${propsIdBase}-name-${index}`} className="text-xs font-medium text-muted-foreground">Name</label>
                    <Input
                      id={`${propsIdBase}-name-${index}`}
                      value={property.name}
                      onChange={(e) => updateProperty(index, { name: e.target.value })}
                      placeholder="Property name"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor={`${propsIdBase}-type-${index}`} className="text-xs font-medium text-muted-foreground">Type</label>
                    <select
                      id={`${propsIdBase}-type-${index}`}
                      className="h-10 w-full rounded-md border border-border bg-surface-1 px-3 text-sm"
                      value={property.type}
                      onChange={(e) => updateProperty(index, { type: e.target.value })}
                    >
                      <option value="enum">enum</option>
                      <option value="text">text</option>
                      <option value="boolean">boolean</option>
                      <option value="instance_swap">instance_swap</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label htmlFor={`${propsIdBase}-default-${index}`} className="text-xs font-medium text-muted-foreground">Default</label>
                    <Input
                      id={`${propsIdBase}-default-${index}`}
                      value={property.default === null || property.default === undefined ? '' : String(property.default)}
                      onChange={(e) => updateProperty(index, { default: e.target.value })}
                      placeholder="Default"
                    />
                  </div>
                  <label className="flex items-center gap-2 rounded-md border border-border bg-surface-1 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(property.required)}
                      onChange={(e) => updateProperty(index, { required: e.target.checked })}
                    />
                    Required
                  </label>
                  <button
                    type="button"
                    className="rounded p-2 text-muted-foreground hover:text-foreground"
                    onClick={() => removeProperty(index)}
                    aria-label={`Remove property ${property.name || index + 1}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="space-y-1">
                    <label htmlFor={`${propsIdBase}-values-${index}`} className="text-xs font-medium text-muted-foreground">Values</label>
                    <Input
                      id={`${propsIdBase}-values-${index}`}
                      value={(property.values ?? []).join(', ')}
                      onChange={(e) => updateProperty(index, {
                        values: e.target.value
                          .split(',')
                          .map((item) => item.trim())
                          .filter((item) => item.length > 0),
                      })}
                      placeholder="Comma-separated values"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor={`${propsIdBase}-description-${index}`} className="text-xs font-medium text-muted-foreground">Description</label>
                    <Input
                      id={`${propsIdBase}-description-${index}`}
                      value={property.description}
                      onChange={(e) => updateProperty(index, { description: e.target.value })}
                      placeholder="Description"
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
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

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <Button variant="outline" size="sm" onClick={addItem}>
            <Plus className="mr-1 h-4 w-4" /> {addLabel}
          </Button>
        </div>
        <CardDescription>{description}</CardDescription>
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
                  className="flex-1 rounded-md border border-border bg-surface-2 px-2 py-1 text-sm"
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
      description="Content rules shown in the detail spec"
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

export function AccessibilityFormCard({ value, onChange }: AccessibilityFormCardProps) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Accessibility</CardTitle>
          <CardDescription>Role, labeling rules, and notes</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="accessibility-role" className="text-sm font-medium">Role</label>
            <Input
              id="accessibility-role"
              value={value.role}
              onChange={(e) => onChange({ ...value, role: e.target.value })}
              placeholder="button"
            />
          </div>
        </CardContent>
      </Card>

      <StringListCard
        title="Accessibility Labeling Rules"
        description="Rules rendered under accessibility.labeling.rules"
        value={value.labelingRules}
        onChange={(items) => onChange({ ...value, labelingRules: items })}
        addLabel="Add rule"
        emptyLabel="No labeling rules yet."
        placeholder="Labeling rule..."
        itemLabel={(index) => `Labeling rule ${index + 1}`}
      />

      <StringListCard
        title="Accessibility Notes"
        description="Additional accessibility considerations"
        value={value.notes}
        onChange={(items) => onChange({ ...value, notes: items })}
        addLabel="Add note"
        emptyLabel="No accessibility notes yet."
        placeholder="Accessibility consideration..."
        itemLabel={(index) => `Accessibility note ${index + 1}`}
      />
    </div>
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
      <PropertiesFormCard
        value={value.properties}
        onChange={(v) => onChange({ properties: v })}
      />
      <VariantsFormCard
        value={value.variants}
        onChange={(v) => onChange({ variants: v })}
      />
      <ContentGuidelinesFormCard
        value={value.contentGuidelines}
        onChange={(v) => onChange({ contentGuidelines: normalizeStringList(v) })}
      />
      <AccessibilityFormCard
        value={value.accessibility}
        onChange={(v) => onChange({
          accessibility: {
            role: v.role,
            labelingRules: normalizeStringList(v.labelingRules),
            notes: normalizeStringList(v.notes),
          },
        })}
      />
    </div>
  );
}
