/**
 * Hook for component-detail page.
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  fetchComponentRegistry,
  fetchComponentSpec,
  fetchComponentUsageIndex,
  fetchTokenRegistry,
  fetchTokenUsageIndex,
} from "@/lib/api";
import type { ComponentRegistryItem, PipelineStage } from "@/types/component-registry";
import type { ComponentUsageEntry, ComponentUsageIndex } from "@/types/component-usage-index";
import type { PartialComponentSpec } from "ds-types";
import type { TokenRegistry } from "@/types/token-registry";
import type { TokenUsageIndex } from "@/types/token-usage-index";
import {
  fetchEditorialSuggestion,
  discardEditorialSuggestion,
} from "../lib/component-spec-api";

const EMPTY_COMPONENT_USAGE_INDEX: ComponentUsageIndex = { by_slug: {} };

interface EditorialSuggestion {
  id: number;
  patch: Record<string, unknown>;
}

interface ComponentDetailViewModel {
  // Data
  loading: boolean;
  error: string | null;
  item: ComponentRegistryItem | null;
  usage: ComponentUsageEntry | null;
  allItems: ComponentRegistryItem[];
  spec: PartialComponentSpec | null;
  specUpdatedAt: number | null;
  tokenRegistry: TokenRegistry | null;
  tokenUsageIndex: TokenUsageIndex | null;
  suggestion: EditorialSuggestion | null;
  suggestionLoading: boolean;

  // UI state
  captureModalOpen: boolean;
  docsModalOpen: boolean;
  editorialEditorOpen: boolean;
  captureSummary: string | null;
  reloadNonce: number;
  docsFilePath: string | null;

  // Derived
  nextStep: PipelineStage | null;
  previousItem: ComponentRegistryItem | null;
  nextItem: ComponentRegistryItem | null;
  currentIndex: number;
  totalItems: number;

  // Handlers
  setCaptureModalOpen: (open: boolean) => void;
  setDocsModalOpen: (open: boolean) => void;
  setEditorialEditorOpen: (open: boolean) => void;
  setCaptureSummary: (summary: string | null) => void;
  handleReload: () => void;
  handleNavigate: (slug: string) => void;
  handleBack: () => void;
  openDocsModal: () => void;
  consumeSuggestion: () => void;
  discardSuggestion: () => void;
}

export function useComponentDetail(): ComponentDetailViewModel {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const [item, setItem] = useState<ComponentRegistryItem | null>(null);
  const [usage, setUsage] = useState<ComponentUsageEntry | null>(null);
  const [allItems, setAllItems] = useState<ComponentRegistryItem[]>([]);
  const [spec, setSpec] = useState<PartialComponentSpec | null>(null);
  const [specUpdatedAt, setSpecUpdatedAt] = useState<number | null>(null);
  const [tokenRegistry, setTokenRegistry] = useState<TokenRegistry | null>(null);
  const [tokenUsageIndex, setTokenUsageIndex] = useState<TokenUsageIndex | null>(null);
  const [captureModalOpen, setCaptureModalOpen] = useState(false);
  const [docsModalOpen, setDocsModalOpen] = useState(false);
  const [editorialEditorOpen, setEditorialEditorOpen] = useState(false);
  const [captureSummary, setCaptureSummary] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<EditorialSuggestion | null>(null);
  const [suggestionLoading, setSuggestionLoading] = useState(false);

  useEffect(() => {
    setCaptureSummary(null);
    setEditorialEditorOpen(false);
    setSuggestion(null);
    setSuggestionLoading(false);
  }, [slug]);

  // Load pending suggestion when editorial editor opens
  useEffect(() => {
    if (!editorialEditorOpen || !slug) return;
    let cancelled = false;
    setSuggestionLoading(true);
    setSuggestion(null);
    fetchEditorialSuggestion(slug)
      .then((data) => {
        if (cancelled) return;
        setSuggestion(data);
      })
      .catch(() => {
        // Silently ignore — suggestion loading is non-blocking
        if (!cancelled) setSuggestion(null);
      })
      .finally(() => {
        if (!cancelled) setSuggestionLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editorialEditorOpen, slug]);

  useEffect(() => {
    if (!slug) return;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [registry, usageIndex, specPayload, tokenRegistryPayload, tokenUsagePayload] =
          await Promise.all([
            fetchComponentRegistry(),
            fetchComponentUsageIndex().catch(() => EMPTY_COMPONENT_USAGE_INDEX),
            fetchComponentSpec(slug).catch(() => null),
            fetchTokenRegistry().catch(() => null),
            fetchTokenUsageIndex().catch(() => null),
          ]);
        const found = registry.components.find((c) => c.slug === slug) ?? null;
        setItem(found);
        setAllItems(registry.components);
        setUsage(usageIndex.by_slug[slug] ?? null);

        // Spec comes complete from API (DB-first, no merge needed)
        if (specPayload?.ok) {
          setSpec(specPayload.spec ?? null);
          setSpecUpdatedAt(specPayload.updatedAt ?? null);
        } else {
          setSpec(null);
          setSpecUpdatedAt(null);
        }

        setTokenRegistry(tokenRegistryPayload);
        setTokenUsageIndex(tokenUsagePayload);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [slug, reloadNonce]);

  const nextStep = useMemo<PipelineStage | null>(() => {
    if (!item?.pipeline_stage) return null;
    const stages: PipelineStage[] = ["missing-spec", "spec", "markdown", "visual-proof"];
    const idx = stages.indexOf(item.pipeline_stage);
    return idx < stages.length - 1 ? stages[idx + 1] : null;
  }, [item?.pipeline_stage]);

  const { previousItem, nextItem, currentIndex, totalItems } = useMemo(() => {
    const idx = allItems.findIndex((i) => i.slug === slug);
    return {
      previousItem: idx > 0 ? allItems[idx - 1] : null,
      nextItem: idx >= 0 && idx < allItems.length - 1 ? allItems[idx + 1] : null,
      currentIndex: idx,
      totalItems: allItems.length,
    };
  }, [allItems, slug]);

  const handleReload = useCallback(() => {
    setReloadNonce((n) => n + 1);
  }, []);

  const handleNavigate = useCallback((targetSlug: string) => {
    navigate(`/components/${encodeURIComponent(targetSlug)}`);
  }, [navigate]);

  const handleBack = useCallback(() => {
    navigate("/components");
  }, [navigate]);

  const openDocsModal = useCallback(() => {
    if (item?.doc?.exists) {
      setDocsModalOpen(true);
    }
  }, [item?.doc?.exists]);

  const consumeSuggestion = useCallback(() => {
    setSuggestion(null);
  }, []);

  const discardSuggestion = useCallback(() => {
    if (!slug) return;
    discardEditorialSuggestion(slug)
      .then(() => {
        setSuggestion(null);
      })
      .catch((error) => {
        console.warn("[component-detail] Failed to discard suggestion; keeping it visible for retry.", error);
      });
  }, [slug]);

  return {
    loading,
    error,
    item,
    usage,
    allItems,
    spec,
    specUpdatedAt,
    tokenRegistry,
    tokenUsageIndex,
    suggestion,
    suggestionLoading,
    captureModalOpen,
    docsModalOpen,
    editorialEditorOpen,
    captureSummary,
    reloadNonce,
    docsFilePath: item?.paths.doc ?? null,
    nextStep,
    previousItem,
    nextItem,
    currentIndex,
    totalItems,
    setCaptureModalOpen,
    setDocsModalOpen,
    setEditorialEditorOpen,
    setCaptureSummary,
    handleReload,
    handleNavigate,
    handleBack,
    openDocsModal,
    consumeSuggestion,
    discardSuggestion,
  };
}
