/**
 * EditComponentDocsPage — dedicated page for editing component documentation.
 *
 * Replaces the modal-based ComponentSpecEditor. Provides:
 * - Editorial form with structured summary, behaviour, variants, content guidelines,
 *   and accessibility
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
import type { PartialComponentSpec } from 'ds-types';
import type { FormDispatchAction, SectionId } from './constants/suggestion-section-map';
import { SECTION_ORDER, SUGGESTION_SECTION_MAP, applySectionAction } from './constants/suggestion-section-map';
import {
  EditDocsForm,
  SummaryFormCard,
  BehaviourFormCard,
  VariantsFormCard,
  ContentGuidelinesFormCard,
  AccessibilityFormCard,
  type EditDocsAccessibilityValue,
  type EditDocsSummaryValue,
} from './components/edit-docs-form';
import {
  AiSuggestionsPanel,
  SummarySuggestionCard,
  BehaviourSuggestionCard,
  VariantsSuggestionCard,
  ContentGuidelinesSuggestionCard,
  AccessibilitySuggestionCard,
} from './components/ai-suggestions-panel';
import { AiSuggestionsModal } from './components/ai-suggestions-modal';
import { useAiSuggestion } from './hooks/use-ai-suggestion';
import { useEditDocsDraft } from './hooks/use-edit-docs-draft';
import { normalizeStringList } from './normalizers';

interface EditorialFormData {
  summary: EditDocsSummaryValue;
  behaviour: string;
  variants: ComponentDocVariant[];
  contentGuidelines: string[];
  accessibility: EditDocsAccessibilityValue;
}

type DraftFieldKey =
  | 'summary'
  | 'behaviour'
  | 'variants'
  | 'contentGuidelines'
  | 'accessibility';

type EditDocsSectionId = SectionId;

const EMPTY_FORM_DATA: EditorialFormData = {
  summary: { purpose: '', whenToUse: '', whenNotToUse: '' },
  behaviour: '',
  variants: [],
  contentGuidelines: [],
  accessibility: { role: '', guidance: [] },
};

const FORM_SECTION_ORDER: readonly EditDocsSectionId[] = [
  'summary',
  'behaviour',
  'accessibility',
  'contentGuidelines',
  'variants',
];

function mergeAccessibilityGuidance(...sources: Array<unknown>): string[] {
  return Array.from(
    new Set(
      sources.flatMap((source) => normalizeStringList(Array.isArray(source) ? source : undefined)),
    ),
  );
}

function hasDraftAccessibilityGuidance(
  draft: Record<string, unknown>,
  draftAccessibility: Record<string, unknown> | null,
): boolean {
  return (
    Array.isArray(draftAccessibility?.guidance) ||
    Array.isArray(draftAccessibility?.labelingRules) ||
    Array.isArray(draftAccessibility?.notes) ||
    Array.isArray(draft.accessibilityGuidance) ||
    Array.isArray(draft.accessibilityNotes)
  );
}

function buildSystemHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const systemId = String(getActiveSystemId() || '').trim();
  return systemId ? { ...extra, 'x-ds-system': systemId } : extra;
}

function normalizeSummaryForSave(summary: EditDocsSummaryValue): {
  purpose: string;
  when_to_use: string;
  when_not_to_use: string;
} | null {
  const normalized = {
    purpose: summary.purpose.trim(),
    when_to_use: summary.whenToUse.trim(),
    when_not_to_use: summary.whenNotToUse.trim(),
  };
  return Object.values(normalized).some((value) => value.length > 0) ? normalized : null;
}

function normalizeVariantsForSave(variants: ComponentDocVariant[]): ComponentDocVariant[] {
  return variants
    .map((variant, index) => {
      const normalizedProperties = Object.fromEntries(
        Object.entries(variant.properties ?? {})
          .map(([key, value]) => [String(key ?? '').trim(), String(value ?? '').trim()] as const)
          .filter(([key]) => key.length > 0),
      );
      const normalized = {
        id: String(variant.id ?? '').trim() || `variant-${index + 1}`,
        name: String(variant.name ?? '').trim(),
        description: String(variant.description ?? '').trim(),
        properties: normalizedProperties,
      } satisfies ComponentDocVariant;
      return normalized;
    })
    .filter((variant) =>
      variant.name.length > 0 ||
      variant.description.length > 0 ||
      Object.keys(variant.properties).length > 0,
    );
}

export function normalizeAccessibilityForSave(
  accessibility: EditDocsAccessibilityValue,
): {
  role?: string;
  labeling?: { rules: string[] };
  notes?: null;
} | null {
  const role = accessibility.role.trim();
  const guidance = normalizeStringList(accessibility.guidance);

  if (!role && guidance.length === 0) {
    return null;
  }

  return {
    ...(role ? { role } : {}),
    ...(guidance.length > 0 ? { labeling: { rules: guidance } } : {}),
    notes: null,
  };
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
  const summary = (spec.summary ?? {}) as Record<string, unknown>;
  const accessibility = (spec.accessibility ?? {}) as Record<string, unknown>;

  return {
    summary: {
      purpose: String(summary.purpose ?? '').trim(),
      whenToUse: String(summary.when_to_use ?? '').trim(),
      whenNotToUse: String(summary.when_not_to_use ?? '').trim(),
    },
    behaviour: String((spec as Record<string, unknown>).behaviour ?? (spec as Record<string, unknown>).behavior ?? '').trim(),
    variants: Array.isArray(spec.variants) ? (spec.variants as ComponentDocVariant[]) : [],
    contentGuidelines: normalizeStringList(spec.content_guidelines?.rules),
    accessibility: {
      role: String(accessibility.role ?? '').trim(),
      guidance: mergeAccessibilityGuidance(
        (accessibility.labeling as Record<string, unknown> | undefined)?.rules,
        accessibility.notes,
      ),
    },
  };
}

export function buildFormDataFromDraft(draft: Record<string, unknown>, fallback: EditorialFormData): EditorialFormData {
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
  const draftGuidance = mergeAccessibilityGuidance(
    draftAccessibility?.guidance,
    draftAccessibility?.labelingRules,
    draftAccessibility?.notes,
    draft.accessibilityGuidance,
    draft.accessibilityNotes,
  );
  const hasDraftGuidance = hasDraftAccessibilityGuidance(draft, draftAccessibility);

  return {
    summary: summaryValue,
    behaviour: typeof draft.behaviour === 'string'
      ? draft.behaviour.trim()
      : typeof draft.behavior === 'string'
        ? draft.behavior.trim()
        : fallback.behaviour,
    variants: Array.isArray(draft.variants) ? (draft.variants as ComponentDocVariant[]) : fallback.variants,
    contentGuidelines: Array.isArray(draft.contentGuidelines)
      ? normalizeStringList(draft.contentGuidelines as unknown[])
      : fallback.contentGuidelines,
    accessibility: {
      role: hasDraftAccessibilityRole
        ? String(draftAccessibility?.role ?? '').trim()
        : fallback.accessibility.role,
      guidance: hasDraftGuidance ? draftGuidance : fallback.accessibility.guidance,
    },
  };
}

function getTouchedFields(formData: EditorialFormData, base: EditorialFormData): DraftFieldKey[] {
  const touchedFields: DraftFieldKey[] = [];
  if (JSON.stringify(formData.summary) !== JSON.stringify(base.summary)) touchedFields.push('summary');
  if (formData.behaviour !== base.behaviour) touchedFields.push('behaviour');
  if (JSON.stringify(formData.variants) !== JSON.stringify(base.variants)) touchedFields.push('variants');
  if (JSON.stringify(formData.contentGuidelines) !== JSON.stringify(base.contentGuidelines)) touchedFields.push('contentGuidelines');
  if (JSON.stringify(formData.accessibility) !== JSON.stringify(base.accessibility)) touchedFields.push('accessibility');
  return touchedFields;
}

function extractFigmaComponentId(spec: PartialComponentSpec | null | undefined): string | null {
  if (!spec) return null;
  const figmaMetadata = (spec as Record<string, unknown>).figma_metadata as Record<string, unknown> | null | undefined;
  const value = String(figmaMetadata?.component_set_node_id ?? '').trim();
  return value || null;
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

  const { data, isLoading, error } = useQuery({
    queryKey: ['component-spec', slug],
    queryFn: () => fetchComponentSpec(slug!),
    enabled: !!slug,
  });
  const figmaComponentId = extractFigmaComponentId(data?.spec);
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

    let nextFormData = buildFormDataFromSpec(spec);
    expectedUpdatedAtRef.current = (data.updatedAt as number | null) ?? null;

    const draft = restoreDraft();
    if (draft && typeof draft === 'object') {
      const draftRecord = draft as unknown as Record<string, unknown>;
      const touched = new Set<DraftFieldKey>(
        Array.isArray(draftRecord.touchedFields)
          ? draftRecord.touchedFields.filter((field): field is DraftFieldKey =>
              field === 'summary' ||
              field === 'behaviour' ||
              field === 'variants' ||
              field === 'contentGuidelines' ||
              field === 'accessibility')
          : [],
      );

      const candidate = buildFormDataFromDraft(draftRecord, nextFormData);
      const hasTouchedMetadata = touched.size > 0;

      if (hasTouchedMetadata) {
        nextFormData = {
          summary: touched.has('summary') ? candidate.summary : nextFormData.summary,
          behaviour: touched.has('behaviour') ? candidate.behaviour : nextFormData.behaviour,
          variants: touched.has('variants') ? candidate.variants : nextFormData.variants,
          contentGuidelines: touched.has('contentGuidelines') ? candidate.contentGuidelines : nextFormData.contentGuidelines,
          accessibility: touched.has('accessibility') ? candidate.accessibility : nextFormData.accessibility,
        };
      } else if (
        typeof draftRecord.summary === 'string' ||
        draftRecord.summary && typeof draftRecord.summary === 'object' ||
        typeof draftRecord.behaviour === 'string' ||
        typeof draftRecord.behavior === 'string' ||
        Array.isArray(draftRecord.variants) ||
        Array.isArray(draftRecord.contentGuidelines) ||
        draftRecord.accessibility ||
        Array.isArray(draftRecord.accessibilityGuidance) ||
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

  const onApplyBehaviour = useCallback(() => {
    if (!suggestion) return;
    handleApplySection({ type: 'SET_BEHAVIOUR', payload: SUGGESTION_SECTION_MAP.behaviour.extract(suggestion) as string });
  }, [suggestion, handleApplySection]);

  const onApplyVariants = useCallback(() => {
    if (!suggestion) return;
    handleApplySection({ type: 'SET_VARIANTS', payload: SUGGESTION_SECTION_MAP.variants.extract(suggestion) as ComponentDocVariant[] });
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
      case 'behaviour':
        return onApplyBehaviour;
      case 'variants':
        return onApplyVariants;
      case 'contentGuidelines':
        return onApplyContentGuidelines;
      case 'accessibility':
        return onApplyAccessibility;
      default: {
        const _exhaustive: never = sectionId;
        return _exhaustive;
      }
    }
  }, [onApplySummary, onApplyBehaviour, onApplyVariants, onApplyContentGuidelines, onApplyAccessibility]);

  const renderFormCard = useCallback((sectionId: EditDocsSectionId) => {
    switch (sectionId) {
      case 'summary':
        return <SummaryFormCard value={formData.summary} onChange={(v) => { setFormData((p) => ({ ...p, summary: v })); setIsDirty(true); }} />;
      case 'behaviour':
        return <BehaviourFormCard value={formData.behaviour} onChange={(v) => { setFormData((p) => ({ ...p, behaviour: v })); setIsDirty(true); }} />;
      case 'variants':
        return <VariantsFormCard value={formData.variants} onChange={(v) => { setFormData((p) => ({ ...p, variants: v })); setIsDirty(true); }} />;
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
      case 'behaviour':
        return <BehaviourSuggestionCard value={SUGGESTION_SECTION_MAP.behaviour.extract(suggestion) as string} onApply={onApplyFn} />;
      case 'variants':
        return <VariantsSuggestionCard value={SUGGESTION_SECTION_MAP.variants.extract(suggestion) as ComponentDocVariant[]} onApply={onApplyFn} />;
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
      const behaviourChanged = formData.behaviour !== baseFormRef.current.behaviour;
      const variantsChanged = JSON.stringify(formData.variants) !== JSON.stringify(baseFormRef.current.variants);
      const contentGuidelinesChanged = JSON.stringify(formData.contentGuidelines) !== JSON.stringify(baseFormRef.current.contentGuidelines);
      const accessibilityChanged = JSON.stringify(formData.accessibility) !== JSON.stringify(baseFormRef.current.accessibility);

      if (summaryChanged) {
        fields.summary = normalizeSummaryForSave(formData.summary);
      }
      if (behaviourChanged) {
        const normalizedBehaviour = formData.behaviour.trim();
        fields.behaviour = normalizedBehaviour.length > 0 ? normalizedBehaviour : null;
      }
      if (variantsChanged) {
        const normalizedVariants = normalizeVariantsForSave(formData.variants);
        fields.variants = normalizedVariants.length > 0 ? normalizedVariants : null;
      }
      if (contentGuidelinesChanged) {
        const normalizedRules = normalizeStringList(formData.contentGuidelines);
        fields.content_guidelines = normalizedRules.length > 0
          ? { rules: normalizedRules }
          : null;
      }
      if (accessibilityChanged) {
        fields.accessibility = normalizeAccessibilityForSave(formData.accessibility);
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
          {hasSuggestion && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                clearSuggestion();
                setShowAiPanel(false);
              }}
            >
              Clear AI suggestions
            </Button>
          )}
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
            const hasSectionSuggestion = hasSuggestion && Boolean(onApplyFn);
            let sectionClassName = 'max-w-3xl';
            if (hasSectionSuggestion) {
              sectionClassName = 'grid grid-cols-2 gap-6 items-start';
            } else if (hasSuggestion) {
              sectionClassName = 'w-full max-w-[calc(50%-0.75rem)]';
            }

            return (
              <div key={sectionId} className={sectionClassName}>
                {renderFormCard(sectionId)}
                {onApplyFn ? renderSuggestionCard(sectionId as SectionId, onApplyFn) : null}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
        <Button onClick={handleSave} disabled={isLoading}>
          Save
        </Button>
        <Button variant="outline" onClick={handleCancel}>
          Cancel
        </Button>
      </div>

      {slug && figmaComponentId && (
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
