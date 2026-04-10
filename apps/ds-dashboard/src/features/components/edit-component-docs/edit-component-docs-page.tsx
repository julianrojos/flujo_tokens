/**
 * EditComponentDocsPage — dedicated page for editing component documentation.
 *
 * Replaces the modal-based ComponentSpecEditor. Provides:
 * - Editorial form with summary, variants, accessibility
 * - AI suggestions modal with "Use this" per section
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
import type { ComponentDocOutput, ComponentDocVariant } from '@/types/ai-jobs';
import type { PartialComponentSpec } from 'ds-types';
import type { FormDispatchAction, SectionId } from './constants/suggestion-section-map';
import { SECTION_ORDER, applySectionAction } from './constants/suggestion-section-map';
import {
  EditDocsForm,
  SummaryFormCard,
  VariantsFormCard,
  AccessibilityFormCard,
} from './components/edit-docs-form';
import {
  AiSuggestionsPanel,
  SummarySuggestionCard,
  VariantsSuggestionCard,
  AccessibilitySuggestionCard,
} from './components/ai-suggestions-panel';
import { AiSuggestionsModal } from './components/ai-suggestions-modal';
import { useAiSuggestion } from './hooks/use-ai-suggestion';
import { useEditDocsDraft } from './hooks/use-edit-docs-draft';

interface EditorialFormData {
  summary: string;
  variants: ComponentDocVariant[];
  accessibilityNotes: string[];
}

type DraftFieldKey = 'summary' | 'variants' | 'accessibilityNotes';

function buildSystemHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const systemId = String(getActiveSystemId() || '').trim();
  return systemId ? { ...extra, 'x-ds-system': systemId } : extra;
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

export function EditComponentDocsPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [formData, setFormData] = useState<EditorialFormData>({
    summary: '',
    variants: [],
    accessibilityNotes: [],
  });
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
  const baseFormRef = useRef<EditorialFormData>({
    summary: '',
    variants: [],
    accessibilityNotes: [],
  });
  const initializedSlugRef = useRef<string | null>(null);

  // Mobile detection
  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 767px)');
    const handleChange = (event: MediaQueryListEvent) => setIsMobile(event.matches);
    setIsMobile(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Reset panel toggle when suggestion disappears
  useEffect(() => {
    if (!suggestion) setShowAiPanel(false);
  }, [suggestion]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['component-spec', slug],
    queryFn: () => fetchComponentSpec(slug!),
    enabled: !!slug,
  });

  // If the loaded spec has no captured Figma component id, any suggestion for
  // this page context is invalid and should be cleared.
  useEffect(() => {
    if (!suggestion || !data?.spec) return;
    const specRecord = data.spec as Record<string, unknown>;
    const figmaMetadata = specRecord.figma_metadata as Record<string, unknown> | null | undefined;
    const currentFigmaComponentId = String(figmaMetadata?.component_set_node_id ?? '').trim();
    if (currentFigmaComponentId) return;
    clearSuggestion();
    setShowAiPanel(false);
  }, [suggestion, data?.spec, clearSuggestion]);

  // Initialize form data from spec
  useEffect(() => {
    if (!slug || !data?.spec) return;
    if (initializedSlugRef.current === slug) return;

    const spec = data.spec;
    const summary = spec.summary?.purpose ?? '';
    const variants = Array.isArray(spec.variants) ? (spec.variants as ComponentDocVariant[]) : [];
    const accNotes = Array.isArray(spec.accessibility?.notes) ? spec.accessibility.notes : [];
    const figmaMetadata = (spec as Record<string, unknown>).figma_metadata as Record<string, unknown> | null | undefined;
    const currentFigmaComponentId = String(figmaMetadata?.component_set_node_id ?? '').trim();
    setFigmaComponentId(currentFigmaComponentId || null);

    let nextFormData: EditorialFormData = {
      summary: typeof summary === 'string' ? summary : '',
      variants,
      accessibilityNotes: accNotes,
    };
    expectedUpdatedAtRef.current = (data.updatedAt as number | null) ?? null;

    // Try to restore draft
    const draft = restoreDraft();
    if (draft && typeof draft.summary === 'string') {
      const touched = new Set<DraftFieldKey>(
        Array.isArray(draft.touchedFields)
          ? draft.touchedFields.filter((field): field is DraftFieldKey =>
            field === 'summary' || field === 'variants' || field === 'accessibilityNotes')
          : [],
      );

      // Backward-compatible fallback for legacy drafts without touchedFields.
      const hasTouchedMetadata = touched.size > 0;
      const shouldUseSummary = hasTouchedMetadata
        ? touched.has('summary')
        : typeof draft.summary === 'string' && draft.summary.trim().length > 0;
      const shouldUseVariants = hasTouchedMetadata
        ? touched.has('variants')
        : Array.isArray(draft.variants) && draft.variants.length > 0;
      const shouldUseAccessibilityNotes = hasTouchedMetadata
        ? touched.has('accessibilityNotes')
        : Array.isArray(draft.accessibilityNotes) && draft.accessibilityNotes.length > 0;

      if (shouldUseSummary && typeof draft.summary === 'string') {
        nextFormData.summary = draft.summary;
      }
      if (shouldUseVariants && Array.isArray(draft.variants)) {
        nextFormData.variants = draft.variants as ComponentDocVariant[];
      }
      if (shouldUseAccessibilityNotes && Array.isArray(draft.accessibilityNotes)) {
        nextFormData.accessibilityNotes = draft.accessibilityNotes;
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
      const touchedFields: DraftFieldKey[] = [];
      if (formData.summary !== baseFormRef.current.summary) touchedFields.push('summary');
      if (JSON.stringify(formData.variants) !== JSON.stringify(baseFormRef.current.variants)) touchedFields.push('variants');
      if (JSON.stringify(formData.accessibilityNotes) !== JSON.stringify(baseFormRef.current.accessibilityNotes)) {
        touchedFields.push('accessibilityNotes');
      }

      saveDraft({
        ...formData,
        touchedFields,
      });
    }
    setAiModalOpen(true);
  }, [isDirty, formData, saveDraft]);

  const handleApplySection = useCallback(
    (action: FormDispatchAction) => {
      setFormData((prev) => applySectionAction(action, prev as unknown as Record<string, unknown>) as unknown as EditorialFormData);
      setIsDirty(true);
    },
    [],
  );

  // Per-section onApply guards — fail-fast if suggestion is absent (S-05).
  const onApplySummary = useCallback(() => {
    if (!suggestion) return;
    handleApplySection({ type: 'SET_SUMMARY', payload: suggestion.summary });
  }, [suggestion, handleApplySection]);

  const onApplyVariants = useCallback(() => {
    if (!suggestion) return;
    handleApplySection({ type: 'SET_VARIANTS', payload: suggestion.variants });
  }, [suggestion, handleApplySection]);

  const onApplyAccessibility = useCallback(() => {
    if (!suggestion) return;
    handleApplySection({ type: 'SET_ACC_NOTES', payload: suggestion.accessibilityNotes });
  }, [suggestion, handleApplySection]);

  const getOnApplyForSection = useCallback((sectionId: SectionId): (() => void) => {
    switch (sectionId) {
      case 'summary':
        return onApplySummary;
      case 'variants':
        return onApplyVariants;
      case 'accessibilityNotes':
        return onApplyAccessibility;
      default: {
        const _exhaustive: never = sectionId;
        return _exhaustive;
      }
    }
  }, [onApplySummary, onApplyVariants, onApplyAccessibility]);

  const renderFormCard = useCallback((sectionId: SectionId) => {
    switch (sectionId) {
      case 'summary':
        return (
          <SummaryFormCard
            value={formData.summary}
            onChange={(v) => { setFormData((p) => ({ ...p, summary: v })); setIsDirty(true); }}
          />
        );
      case 'variants':
        return (
          <VariantsFormCard
            value={formData.variants}
            onChange={(v) => { setFormData((p) => ({ ...p, variants: v })); setIsDirty(true); }}
          />
        );
      case 'accessibilityNotes':
        return (
          <AccessibilityFormCard
            value={formData.accessibilityNotes}
            onChange={(v) => { setFormData((p) => ({ ...p, accessibilityNotes: v })); setIsDirty(true); }}
          />
        );
      default: {
        const _exhaustive: never = sectionId;
        return _exhaustive;
      }
    }
  }, [formData.summary, formData.variants, formData.accessibilityNotes]);

  const renderSuggestionCard = useCallback((sectionId: SectionId, onApplyFn: () => void) => {
    if (!suggestion || !figmaComponentId) return null;
    switch (sectionId) {
      case 'summary':
        return <SummarySuggestionCard value={suggestion.summary} onApply={onApplyFn} />;
      case 'variants':
        return <VariantsSuggestionCard value={suggestion.variants} onApply={onApplyFn} />;
      case 'accessibilityNotes':
        return <AccessibilitySuggestionCard value={suggestion.accessibilityNotes} onApply={onApplyFn} />;
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

      const summaryChanged = formData.summary !== baseFormRef.current.summary;
      const variantsChanged = JSON.stringify(formData.variants) !== JSON.stringify(baseFormRef.current.variants);
      const accessibilityChanged =
        JSON.stringify(formData.accessibilityNotes) !== JSON.stringify(baseFormRef.current.accessibilityNotes);

      if (summaryChanged) {
        fields.summary = formData.summary.trim().length > 0 ? { purpose: formData.summary } : {};
      }
      if (variantsChanged) {
        fields.variants = formData.variants;
      }
      if (accessibilityChanged) {
        fields.accessibility = { notes: formData.accessibilityNotes };
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
      <PageHeader
        title="Edit component documentation"
        description={slug}
      />

      {/* Header actions */}
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

      {/* Save error */}
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

      {/* Main content — S-04: aligned grid rows iterated over SECTION_ORDER */}
      {isMobile ? (
        <div>
          {!showAiPanel ? (
            <EditDocsForm
              value={formData}
              onChange={(data) => {
                setFormData(data);
                setIsDirty(true);
              }}
            />
          ) : hasSuggestion && suggestion ? (
            <AiSuggestionsPanel
              suggestion={suggestion}
              onApplySection={handleApplySection}
            />
          ) : null}
        </div>
      ) : (
        <div className="space-y-6">
          {SECTION_ORDER.map((sectionId) => {
            const onApplyFn = getOnApplyForSection(sectionId);

            return (
              <div key={sectionId} className={hasSuggestion ? 'grid grid-cols-2 gap-6 items-start' : 'max-w-3xl'}>
                {renderFormCard(sectionId)}
                {renderSuggestionCard(sectionId, onApplyFn)}
              </div>
            );
          })}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-3 border-t border-border pt-4">
        <Button onClick={handleSave} disabled={isLoading}>
          Save
        </Button>
        <Button variant="outline" onClick={handleCancel}>
          Cancel
        </Button>
      </div>

      {/* AI Suggestions Modal */}
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
