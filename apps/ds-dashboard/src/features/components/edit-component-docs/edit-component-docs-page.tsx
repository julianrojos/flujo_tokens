/**
 * EditComponentDocsPage — dedicated page for editing component documentation.
 *
 * Replaces the modal-based ComponentSpecEditor. Provides:
 * - Editorial form with structured summary, properties, variants, best practices,
 *   content guidelines, and accessibility
 * - AI suggestions modal with "Use this" per supported section
 * - Autosave draft before opening AI modal
 * - Save to PATCH /api/component-spec/:slug/editorial
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/composites';
import { StatusAlert } from '@/components/ui/status-alert';
import { Button } from '@/components/ui/button';
import { getActiveSystemId } from '@/lib/api';
import { getEditDocsStorageScope } from '@/lib/edit-docs-storage-namespace';
import type { ComponentDocVariant } from '@/types/ai-jobs';
import type { PartialComponentSpec, SpecProperty } from 'ds-types';
import type { FormDispatchAction, SectionId } from './constants/suggestion-section-map';
import { SECTION_ORDER, SUGGESTION_SECTION_MAP, applySectionAction } from './constants/suggestion-section-map';
import {
  EditDocsForm,
  SummaryFormCard,
  PropertiesFormCard,
  VariantsFormCard,
  BestPracticesFormCard,
  ContentGuidelinesFormCard,
  AccessibilityFormCard,
  type EditDocsAccessibilityValue,
  type EditDocsBestPracticesValue,
  type EditDocsSummaryValue,
} from './components/edit-docs-form';
import {
  AiSuggestionsPanel,
  SummarySuggestionCard,
  VariantsSuggestionCard,
  BestPracticesSuggestionCard,
  ContentGuidelinesSuggestionCard,
  AccessibilitySuggestionCard,
} from './components/ai-suggestions-panel';
import { AiSuggestionsModal } from './components/ai-suggestions-modal';
import { useAiSuggestion } from './hooks/use-ai-suggestion';
import { useEditDocsDraft } from './hooks/use-edit-docs-draft';
import { normalizeStringList } from './normalizers';

interface EditorialFormData {
  summary: EditDocsSummaryValue;
  properties: SpecProperty[];
  variants: ComponentDocVariant[];
  bestPractices: EditDocsBestPracticesValue;
  contentGuidelines: string[];
  accessibility: EditDocsAccessibilityValue;
}

type DraftFieldKey =
  | 'summary'
  | 'properties'
  | 'variants'
  | 'bestPractices'
  | 'contentGuidelines'
  | 'accessibility';

type EditDocsSectionId = SectionId | 'properties';

const EMPTY_FORM_DATA: EditorialFormData = {
  summary: { purpose: '', whenToUse: '', whenNotToUse: '' },
  properties: [],
  variants: [],
  bestPractices: { do: [], dont: [] },
  contentGuidelines: [],
  accessibility: { role: '', labelingRules: [], notes: [] },
};

const FORM_SECTION_ORDER: readonly EditDocsSectionId[] = [
  'summary',
  'properties',
  'variants',
  'bestPractices',
  'contentGuidelines',
  'accessibility',
];

function buildSystemHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const systemId = String(getActiveSystemId() || '').trim();
  return systemId ? { ...extra, 'x-ds-system': systemId } : extra;
}

function normalizeProperties(properties: SpecProperty[]): SpecProperty[] {
  return properties
    .map((property) => {
      const defaultValue = property.default;
      const normalizedDefault = typeof defaultValue === 'string'
        ? defaultValue.trim()
        : defaultValue === undefined
          ? ''
          : defaultValue;

      return {
        ...property,
        name: String(property.name ?? '').trim(),
        type: String(property.type ?? '').trim() || 'text',
        values: normalizeStringList(Array.isArray(property.values) ? property.values : []),
        default: normalizedDefault,
        required: Boolean(property.required),
        description: String(property.description ?? '').trim(),
      } satisfies SpecProperty;
    })
    .filter((property) => property.name.length > 0);
}

function fetchComponentSpec(slug: string) {
  return fetch(`/api/component-spec/${slug}`, {
    headers: buildSystemHeaders(),
  }).then(async (res) => {
    if (!res.ok) throw new Error(`Failed to fetch spec: ${res.status}`);
    return res.json() as Promise<{ ok: boolean; exists: boolean; spec: PartialComponentSpec; updatedAt: number | null }>;
  });
}

async function patchEditorial(
  slug: string,
  expectedUpdatedAt: number | null,
  fields: Record<string, unknown>,
) {
  const res = await fetch(`/api/component-spec/${slug}/editorial`, {
    method: 'PATCH',
    headers: buildSystemHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ expectedUpdatedAt, fields }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ userMessage: 'Save failed' }));
    throw new Error(error.userMessage ?? 'Save failed');
  }
  return res.json() as Promise<{ ok: boolean; updatedAt: number }>;
}

function buildFormDataFromSpec(spec: PartialComponentSpec): EditorialFormData {
  const summary = spec.summary ?? {};
  const bestPractices = spec.best_practices ?? {};
  const accessibility = spec.accessibility ?? {};

  return {
    summary: {
      purpose: String(summary.purpose ?? '').trim(),
      whenToUse: String(summary.when_to_use ?? '').trim(),
      whenNotToUse: String(summary.when_not_to_use ?? '').trim(),
    },
    properties: Array.isArray(spec.properties) ? (spec.properties as SpecProperty[]) : [],
    variants: Array.isArray(spec.variants) ? (spec.variants as ComponentDocVariant[]) : [],
    bestPractices: {
      do: normalizeStringList(bestPractices.do as unknown[] | undefined),
      dont: normalizeStringList(bestPractices.dont as unknown[] | undefined),
    },
    contentGuidelines: normalizeStringList(spec.content_guidelines?.rules as unknown[] | undefined),
    accessibility: {
      role: String(accessibility.role ?? '').trim(),
      labelingRules: normalizeStringList(accessibility.labeling?.rules as unknown[] | undefined),
      notes: normalizeStringList(accessibility.notes as unknown[] | undefined),
    },
  };
}

function buildFormDataFromDraft(draft: Record<string, unknown>, fallback: EditorialFormData): EditorialFormData {
  const draftSummary = draft.summary;
  const summaryValue: EditDocsSummaryValue =
    draftSummary && typeof draftSummary === 'object'
      ? {
          purpose: String((draftSummary as Record<string, unknown>).purpose ?? '').trim(),
          whenToUse: String(
            (draftSummary as Record<string, unknown>).whenToUse ??
            (draftSummary as Record<string, unknown>).when_to_use ??
            '',
          ).trim(),
          whenNotToUse: String(
            (draftSummary as Record<string, unknown>).whenNotToUse ??
            (draftSummary as Record<string, unknown>).when_not_to_use ??
            '',
          ).trim(),
        }
      : typeof draftSummary === 'string'
        ? { ...fallback.summary, purpose: draftSummary }
        : fallback.summary;

  const draftAccessibility = draft.accessibility && typeof draft.accessibility === 'object'
    ? draft.accessibility as Record<string, unknown>
    : null;
  const hasDraftAccessibilityRole =
    draftAccessibility !== null
    && Object.prototype.hasOwnProperty.call(draftAccessibility, 'role');

  return {
    summary: summaryValue,
    properties: Array.isArray(draft.properties) ? (draft.properties as SpecProperty[]) : fallback.properties,
    variants: Array.isArray(draft.variants) ? (draft.variants as ComponentDocVariant[]) : fallback.variants,
    bestPractices: draft.bestPractices && typeof draft.bestPractices === 'object'
      ? {
          do: normalizeStringList((draft.bestPractices as Record<string, unknown>).do as unknown[] | undefined),
          dont: normalizeStringList((draft.bestPractices as Record<string, unknown>).dont as unknown[] | undefined),
        }
      : fallback.bestPractices,
    contentGuidelines: Array.isArray(draft.contentGuidelines)
      ? normalizeStringList(draft.contentGuidelines as unknown[])
      : fallback.contentGuidelines,
    accessibility: {
      role: hasDraftAccessibilityRole
        ? String(draftAccessibility?.role ?? '').trim()
        : fallback.accessibility.role,
      labelingRules: Array.isArray(draftAccessibility?.labelingRules)
        ? normalizeStringList(draftAccessibility?.labelingRules as unknown[])
        : fallback.accessibility.labelingRules,
      notes: Array.isArray(draftAccessibility?.notes)
        ? normalizeStringList(draftAccessibility.notes as unknown[])
        : Array.isArray(draft.accessibilityNotes)
          ? normalizeStringList(draft.accessibilityNotes as unknown[])
          : fallback.accessibility.notes,
    },
  };
}

function getTouchedFields(formData: EditorialFormData, base: EditorialFormData): DraftFieldKey[] {
  const touchedFields: DraftFieldKey[] = [];
  if (JSON.stringify(formData.summary) !== JSON.stringify(base.summary)) touchedFields.push('summary');
  if (JSON.stringify(formData.properties) !== JSON.stringify(base.properties)) touchedFields.push('properties');
  if (JSON.stringify(formData.variants) !== JSON.stringify(base.variants)) touchedFields.push('variants');
  if (JSON.stringify(formData.bestPractices) !== JSON.stringify(base.bestPractices)) touchedFields.push('bestPractices');
  if (JSON.stringify(formData.contentGuidelines) !== JSON.stringify(base.contentGuidelines)) touchedFields.push('contentGuidelines');
  if (JSON.stringify(formData.accessibility) !== JSON.stringify(base.accessibility)) touchedFields.push('accessibility');
  return touchedFields;
}

export function EditComponentDocsPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [formData, setFormData] = useState<EditorialFormData>(EMPTY_FORM_DATA);
  const activeSystemId = String(getActiveSystemId() || '').trim() || null;
  const editDocsStorageScope = getEditDocsStorageScope(activeSystemId);

  const [figmaComponentId, setFigmaComponentId] = useState<string | null>(null);
  const { suggestion, saveSuggestion, clearSuggestion, isInMemoryOnly } = useAiSuggestion(
    slug!,
    editDocsStorageScope,
    figmaComponentId,
  );
  const { saveDraft, restoreDraft, clearDraft } = useEditDocsDraft(slug!, editDocsStorageScope);
  const expectedUpdatedAtRef = useRef<number | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const baseFormRef = useRef<EditorialFormData>(EMPTY_FORM_DATA);
  const initializedSlugRef = useRef<string | null>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 767px)');
    const handleChange = (event: MediaQueryListEvent) => setIsMobile(event.matches);
    setIsMobile(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    if (!suggestion) setShowAiPanel(false);
  }, [suggestion]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['component-spec', slug],
    queryFn: () => fetchComponentSpec(slug!),
    enabled: !!slug,
  });

  useEffect(() => {
    if (!suggestion || !data?.spec) return;
    const specRecord = data.spec as Record<string, unknown>;
    const figmaMetadata = specRecord.figma_metadata as Record<string, unknown> | null | undefined;
    const currentFigmaComponentId = String(figmaMetadata?.component_set_node_id ?? '').trim();
    if (currentFigmaComponentId) return;
    clearSuggestion();
    setShowAiPanel(false);
  }, [suggestion, data?.spec, clearSuggestion]);

  useEffect(() => {
    if (!slug || !data?.spec) return;
    if (initializedSlugRef.current === slug) return;

    const spec = data.spec;
    const figmaMetadata = (spec as Record<string, unknown>).figma_metadata as Record<string, unknown> | null | undefined;
    const currentFigmaComponentId = String(figmaMetadata?.component_set_node_id ?? '').trim();
    setFigmaComponentId(currentFigmaComponentId || null);

    let nextFormData = buildFormDataFromSpec(spec);
    expectedUpdatedAtRef.current = (data.updatedAt as number | null) ?? null;

    const draft = restoreDraft();
    if (draft && typeof draft === 'object') {
      const draftRecord = draft as Record<string, unknown>;
      const touched = new Set<DraftFieldKey>(
        Array.isArray(draftRecord.touchedFields)
          ? draftRecord.touchedFields.filter((field): field is DraftFieldKey =>
              field === 'summary' ||
              field === 'properties' ||
              field === 'variants' ||
              field === 'bestPractices' ||
              field === 'contentGuidelines' ||
              field === 'accessibility')
          : [],
      );

      const candidate = buildFormDataFromDraft(draftRecord, nextFormData);
      const hasTouchedMetadata = touched.size > 0;

      if (hasTouchedMetadata) {
        nextFormData = {
          summary: touched.has('summary') ? candidate.summary : nextFormData.summary,
          properties: touched.has('properties') ? candidate.properties : nextFormData.properties,
          variants: touched.has('variants') ? candidate.variants : nextFormData.variants,
          bestPractices: touched.has('bestPractices') ? candidate.bestPractices : nextFormData.bestPractices,
          contentGuidelines: touched.has('contentGuidelines') ? candidate.contentGuidelines : nextFormData.contentGuidelines,
          accessibility: touched.has('accessibility') ? candidate.accessibility : nextFormData.accessibility,
        };
      } else if (
        typeof draftRecord.summary === 'string' ||
        draftRecord.summary && typeof draftRecord.summary === 'object' ||
        Array.isArray(draftRecord.properties) ||
        Array.isArray(draftRecord.variants) ||
        draftRecord.bestPractices ||
        Array.isArray(draftRecord.contentGuidelines) ||
        draftRecord.accessibility ||
        Array.isArray(draftRecord.accessibilityNotes)
      ) {
        nextFormData = candidate;
      }
    }

    baseFormRef.current = nextFormData;
    setFormData(nextFormData);
    initializedSlugRef.current = slug;
  }, [data, restoreDraft, slug]);

  useEffect(() => {
    initializedSlugRef.current = null;
    setIsDirty(false);
    setFigmaComponentId(null);
  }, [slug]);

  const handleOpenAiModal = useCallback(() => {
    if (isDirty) {
      saveDraft({
        ...formData,
        touchedFields: getTouchedFields(formData, baseFormRef.current),
      });
    }
    setAiModalOpen(true);
  }, [isDirty, formData, saveDraft]);

  const handleApplySection = useCallback((action: FormDispatchAction) => {
    setFormData((prev) => (
      applySectionAction(action, prev as unknown as Record<string, unknown>) as unknown as EditorialFormData
    ));
    setIsDirty(true);
  }, []);

  const onApplySummary = useCallback(() => {
    if (!suggestion) return;
    handleApplySection({ type: 'SET_SUMMARY', payload: SUGGESTION_SECTION_MAP.summary.extract(suggestion) as EditDocsSummaryValue });
  }, [suggestion, handleApplySection]);

  const onApplyVariants = useCallback(() => {
    if (!suggestion) return;
    handleApplySection({ type: 'SET_VARIANTS', payload: SUGGESTION_SECTION_MAP.variants.extract(suggestion) as ComponentDocVariant[] });
  }, [suggestion, handleApplySection]);

  const onApplyBestPractices = useCallback(() => {
    if (!suggestion) return;
    handleApplySection({
      type: 'SET_BEST_PRACTICES',
      payload: SUGGESTION_SECTION_MAP.bestPractices.extract(suggestion) as EditDocsBestPracticesValue,
    });
  }, [suggestion, handleApplySection]);

  const onApplyContentGuidelines = useCallback(() => {
    if (!suggestion) return;
    handleApplySection({
      type: 'SET_CONTENT_GUIDELINES',
      payload: SUGGESTION_SECTION_MAP.contentGuidelines.extract(suggestion) as string[],
    });
  }, [suggestion, handleApplySection]);

  const onApplyAccessibility = useCallback(() => {
    if (!suggestion) return;
    handleApplySection({
      type: 'SET_ACCESSIBILITY',
      payload: SUGGESTION_SECTION_MAP.accessibility.extract(suggestion) as EditDocsAccessibilityValue,
    });
  }, [suggestion, handleApplySection]);

  const getOnApplyForSection = useCallback((sectionId: SectionId): (() => void) => {
    switch (sectionId) {
      case 'summary':
        return onApplySummary;
      case 'variants':
        return onApplyVariants;
      case 'bestPractices':
        return onApplyBestPractices;
      case 'contentGuidelines':
        return onApplyContentGuidelines;
      case 'accessibility':
        return onApplyAccessibility;
      default: {
        const _exhaustive: never = sectionId;
        return _exhaustive;
      }
    }
  }, [onApplySummary, onApplyVariants, onApplyBestPractices, onApplyContentGuidelines, onApplyAccessibility]);

  const renderFormCard = useCallback((sectionId: EditDocsSectionId) => {
    switch (sectionId) {
      case 'summary':
        return <SummaryFormCard value={formData.summary} onChange={(v) => { setFormData((p) => ({ ...p, summary: v })); setIsDirty(true); }} />;
      case 'properties':
        return <PropertiesFormCard value={formData.properties} onChange={(v) => { setFormData((p) => ({ ...p, properties: v })); setIsDirty(true); }} />;
      case 'variants':
        return <VariantsFormCard value={formData.variants} onChange={(v) => { setFormData((p) => ({ ...p, variants: v })); setIsDirty(true); }} />;
      case 'bestPractices':
        return <BestPracticesFormCard value={formData.bestPractices} onChange={(v) => { setFormData((p) => ({ ...p, bestPractices: v })); setIsDirty(true); }} />;
      case 'contentGuidelines':
        return <ContentGuidelinesFormCard value={formData.contentGuidelines} onChange={(v) => { setFormData((p) => ({ ...p, contentGuidelines: v })); setIsDirty(true); }} />;
      case 'accessibility':
        return <AccessibilityFormCard value={formData.accessibility} onChange={(v) => { setFormData((p) => ({ ...p, accessibility: v })); setIsDirty(true); }} />;
      default: {
        const _exhaustive: never = sectionId;
        return _exhaustive;
      }
    }
  }, [formData]);

  const renderSuggestionCard = useCallback((sectionId: SectionId, onApplyFn: () => void) => {
    if (!suggestion || !figmaComponentId) return null;
    switch (sectionId) {
      case 'summary':
        return <SummarySuggestionCard value={SUGGESTION_SECTION_MAP.summary.extract(suggestion) as EditDocsSummaryValue} onApply={onApplyFn} />;
      case 'variants':
        return <VariantsSuggestionCard value={SUGGESTION_SECTION_MAP.variants.extract(suggestion) as ComponentDocVariant[]} onApply={onApplyFn} />;
      case 'bestPractices':
        return <BestPracticesSuggestionCard value={SUGGESTION_SECTION_MAP.bestPractices.extract(suggestion) as EditDocsBestPracticesValue} onApply={onApplyFn} />;
      case 'contentGuidelines':
        return <ContentGuidelinesSuggestionCard value={SUGGESTION_SECTION_MAP.contentGuidelines.extract(suggestion) as string[]} onApply={onApplyFn} />;
      case 'accessibility':
        return <AccessibilitySuggestionCard value={SUGGESTION_SECTION_MAP.accessibility.extract(suggestion) as EditDocsAccessibilityValue} onApply={onApplyFn} />;
      default: {
        const _exhaustive: never = sectionId;
        return _exhaustive;
      }
    }
  }, [suggestion, figmaComponentId]);

  const handleSave = useCallback(async () => {
    if (!slug) return;
    setSaveError(null);
    try {
      const fields: Record<string, unknown> = {};

      const summaryChanged = JSON.stringify(formData.summary) !== JSON.stringify(baseFormRef.current.summary);
      const propertiesChanged = JSON.stringify(formData.properties) !== JSON.stringify(baseFormRef.current.properties);
      const variantsChanged = JSON.stringify(formData.variants) !== JSON.stringify(baseFormRef.current.variants);
      const bestPracticesChanged = JSON.stringify(formData.bestPractices) !== JSON.stringify(baseFormRef.current.bestPractices);
      const contentGuidelinesChanged = JSON.stringify(formData.contentGuidelines) !== JSON.stringify(baseFormRef.current.contentGuidelines);
      const accessibilityChanged = JSON.stringify(formData.accessibility) !== JSON.stringify(baseFormRef.current.accessibility);

      if (summaryChanged) {
        const nextSummary = {
          purpose: formData.summary.purpose.trim(),
          when_to_use: formData.summary.whenToUse.trim(),
          when_not_to_use: formData.summary.whenNotToUse.trim(),
        };
        fields.summary = Object.values(nextSummary).some((value) => value.length > 0) ? nextSummary : {};
      }
      if (propertiesChanged) {
        fields.properties = normalizeProperties(formData.properties);
      }
      if (variantsChanged) {
        fields.variants = formData.variants;
      }
      if (bestPracticesChanged) {
        fields.best_practices = {
          do: normalizeStringList(formData.bestPractices.do),
          dont: normalizeStringList(formData.bestPractices.dont),
        };
      }
      if (contentGuidelinesChanged) {
        fields.content_guidelines = {
          rules: normalizeStringList(formData.contentGuidelines),
        };
      }
      if (accessibilityChanged) {
        fields.accessibility = {
          role: formData.accessibility.role.trim(),
          labeling: {
            rules: normalizeStringList(formData.accessibility.labelingRules),
          },
          notes: normalizeStringList(formData.accessibility.notes),
        };
      }

      if (Object.keys(fields).length === 0) {
        navigate(-1);
        return;
      }

      await patchEditorial(slug, expectedUpdatedAtRef.current, fields);
      clearSuggestion();
      clearDraft();
      navigate(-1);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    }
  }, [slug, formData, clearSuggestion, clearDraft, navigate]);

  const handleCancel = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  if (isLoading) {
    return (
      <div className="space-y-5">
        <PageHeader title="Loading…" description="Loading component documentation" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-5">
        <PageHeader title="Failed to load" description={slug} />
        <StatusAlert variant="error" description={error?.message ?? 'Component not found'} />
        <Button variant="outline" onClick={handleCancel}>← Back</Button>
      </div>
    );
  }

  const hasSuggestion = suggestion !== null && Boolean(figmaComponentId);

  return (
    <div className="space-y-5">
      <PageHeader title="Edit component documentation" description={slug} />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenAiModal}
            disabled={!figmaComponentId}
            title={!figmaComponentId ? 'Figma data not yet captured for this component' : undefined}
          >
            AI suggestions
          </Button>
        </div>
        {isMobile && hasSuggestion && (
          <div className="flex gap-1 rounded-lg border border-border p-0.5">
            <Button
              variant={!showAiPanel ? 'outline' : 'ghost'}
              size="sm"
              onClick={() => setShowAiPanel(false)}
              className={!showAiPanel ? 'bg-surface-2' : ''}
              aria-pressed={!showAiPanel}
            >
              Your doc
            </Button>
            <Button
              variant={showAiPanel ? 'outline' : 'ghost'}
              size="sm"
              onClick={() => setShowAiPanel(true)}
              className={showAiPanel ? 'bg-surface-2' : ''}
              aria-pressed={showAiPanel}
            >
              AI suggestion
            </Button>
          </div>
        )}
      </div>

      {saveError && (
        <StatusAlert variant="error" title="Save failed" description={saveError} />
      )}
      {isInMemoryOnly && hasSuggestion && (
        <StatusAlert
          variant="warning"
          title="Suggestion not persisted"
          description="This AI suggestion is too large to persist in local storage and will be lost on page reload."
        />
      )}
      {!figmaComponentId && (
        <StatusAlert
          variant="info"
          title="AI suggestions unavailable"
          description="Capture Figma data first to enable AI suggestions for this component."
        />
      )}

      {isMobile ? (
        <div>
          {!showAiPanel ? (
            <EditDocsForm
              value={formData}
              onChange={(nextPartial) => {
                setFormData((prev) => ({ ...prev, ...nextPartial }));
                setIsDirty(true);
              }}
            />
          ) : hasSuggestion && suggestion ? (
            <AiSuggestionsPanel suggestion={suggestion} onApplySection={handleApplySection} />
          ) : null}
        </div>
      ) : (
        <div className="space-y-6">
          {FORM_SECTION_ORDER.map((sectionId) => {
            const onApplyFn = SECTION_ORDER.includes(sectionId as SectionId)
              ? getOnApplyForSection(sectionId as SectionId)
              : null;

            return (
              <div key={sectionId} className={hasSuggestion && onApplyFn ? 'grid grid-cols-2 gap-6 items-start' : 'max-w-3xl'}>
                {renderFormCard(sectionId)}
                {onApplyFn ? renderSuggestionCard(sectionId as SectionId, onApplyFn) : null}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-3 border-t border-border pt-4">
        <Button onClick={handleSave} disabled={isLoading}>
          Save
        </Button>
        <Button variant="outline" onClick={handleCancel}>
          Cancel
        </Button>
      </div>

      {slug && (
        <AiSuggestionsModal
          open={aiModalOpen}
          onClose={() => setAiModalOpen(false)}
          figmaComponentId={figmaComponentId}
          onSaveSuggestion={saveSuggestion}
        />
      )}
    </div>
  );
}
