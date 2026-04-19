/**
 * Hook for component-detail page.
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  fetchComponentCatalog,
  fetchComponentSpec,
  fetchComponentUsageIndex,
  fetchTokenCatalog,
} from "@/lib/api";
import type { ComponentCatalogItem } from "@/types/component-catalog";
import type { ComponentUsageEntry, ComponentUsageIndex } from "@/types/component-usage-index";
import type { PartialComponentSpec } from "ds-types";
import type { TokenCatalog } from "@/types/token-catalog";
const EMPTY_COMPONENT_USAGE_INDEX: ComponentUsageIndex = { by_slug: {} };

interface ComponentDetailViewModel {
  // Data
  loading: boolean;
  error: string | null;
  item: ComponentCatalogItem | null;
  usage: ComponentUsageEntry | null;
  allItems: ComponentCatalogItem[];
  spec: PartialComponentSpec | null;
  hasEditorialSpec: boolean;
  isEditorialSpecStatusUnknown: boolean;
  tokenCatalog: TokenCatalog | null;
  downloadError: string | null;
  downloadWarnings: string[];

  // UI state
  canOpenDocs: boolean;
  isDownloadingMarkdown: boolean;

  // Derived
  previousItem: ComponentCatalogItem | null;
  nextItem: ComponentCatalogItem | null;
  currentIndex: number;
  totalItems: number;

  // Handlers
  handleNavigate: (slug: string) => void;
  handleBack: () => void;
  downloadMarkdown: () => Promise<void>;
}

export function useComponentDetail(): ComponentDetailViewModel {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const [item, setItem] = useState<ComponentCatalogItem | null>(null);
  const [usage, setUsage] = useState<ComponentUsageEntry | null>(null);
  const [allItems, setAllItems] = useState<ComponentCatalogItem[]>([]);
  const [spec, setSpec] = useState<PartialComponentSpec | null>(null);
  const [hasEditorialSpec, setHasEditorialSpec] = useState(false);
  const [isEditorialSpecStatusUnknown, setIsEditorialSpecStatusUnknown] = useState(false);
  const [tokenCatalog, setTokenCatalog] = useState<TokenCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDownloadingMarkdown, setIsDownloadingMarkdown] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadWarnings, setDownloadWarnings] = useState<string[]>([]);

  useEffect(() => {
    setDownloadError(null);
    setDownloadWarnings([]);
    setIsDownloadingMarkdown(false);
    setIsEditorialSpecStatusUnknown(false);
  }, [slug]);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [registry, usageIndex, specResult, tokenCatalogPayload] =
          await Promise.all([
            fetchComponentCatalog(),
            fetchComponentUsageIndex().catch(() => EMPTY_COMPONENT_USAGE_INDEX),
            fetchComponentSpec(slug)
              .then((payload) => ({ ok: true as const, payload }))
              .catch((cause) => ({ ok: false as const, cause })),
            fetchTokenCatalog().catch(() => null),
          ]);
        const found = registry.components.find((c) => c.slug === slug) ?? null;
        if (cancelled) return;
        setItem(found);
        setAllItems(registry.components);
        setUsage(usageIndex.by_slug[slug] ?? null);

        // Spec comes complete from API (DB-first, no merge needed)
        if (specResult.ok && specResult.payload?.ok) {
          if (cancelled) return;
          setSpec(specResult.payload.spec ?? null);
          setHasEditorialSpec(specResult.payload.exists === true);
          setIsEditorialSpecStatusUnknown(false);
        } else if (specResult.ok) {
          if (cancelled) return;
          setSpec(null);
          setHasEditorialSpec(false);
          setIsEditorialSpecStatusUnknown(false);
        } else {
          if (cancelled) return;
          setSpec(null);
          // Preserve markdown access when spec availability cannot be verified.
          setIsEditorialSpecStatusUnknown(true);
        }

        if (cancelled) return;
        setTokenCatalog(tokenCatalogPayload);
      } catch (cause) {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        if (cancelled) return;
        setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const { previousItem, nextItem, currentIndex, totalItems } = useMemo(() => {
    const idx = allItems.findIndex((i) => i.slug === slug);
    return {
      previousItem: idx > 0 ? allItems[idx - 1] : null,
      nextItem: idx >= 0 && idx < allItems.length - 1 ? allItems[idx + 1] : null,
      currentIndex: idx,
      totalItems: allItems.length,
    };
  }, [allItems, slug]);

  const handleNavigate = useCallback((targetSlug: string) => {
    navigate(`/components/${encodeURIComponent(targetSlug)}`);
  }, [navigate]);

  const handleBack = useCallback(() => {
    navigate("/components");
  }, [navigate]);

  const downloadMarkdown = useCallback(async () => {
    if (!item) return;
    setIsDownloadingMarkdown(true);
    setDownloadError(null);
    setDownloadWarnings([]);

    try {
      const res = await fetch(`/api/components/${encodeURIComponent(item.slug)}/docs/markdown`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const payload = await res.json() as {
        ok: true;
        markdown: string;
        warnings?: string[];
      };

      const markdown = payload.markdown;
      const warnings = Array.isArray(payload.warnings)
        ? payload.warnings.filter((warning): warning is string => typeof warning === "string" && warning.length > 0)
        : [];
      setDownloadWarnings(warnings);
      const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      try {
        a.href = url;
        a.download = `${item.slug}.md`;
        document.body.appendChild(a);
        a.click();
      } finally {
        a.remove();
        // Revoke asynchronously to avoid browsers dropping the download
        // before the navigation to the blob URL has actually started.
        setTimeout(() => URL.revokeObjectURL(url), 100);
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setDownloadError(`Unable to download markdown: ${message}`);
    } finally {
      setIsDownloadingMarkdown(false);
    }
  }, [item]);

  return {
    loading,
    error,
    item,
    usage,
    allItems,
    spec,
    hasEditorialSpec,
    isEditorialSpecStatusUnknown,
    tokenCatalog,
    downloadError,
    downloadWarnings,
    canOpenDocs: Boolean(item),
    isDownloadingMarkdown,
    previousItem,
    nextItem,
    currentIndex,
    totalItems,
    handleNavigate,
    handleBack,
    downloadMarkdown,
  };
}
