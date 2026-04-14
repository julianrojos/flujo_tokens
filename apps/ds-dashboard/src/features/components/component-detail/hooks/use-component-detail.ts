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
} from "@/lib/api";
import type { ComponentRegistryItem } from "@/types/component-registry";
import type { ComponentUsageEntry, ComponentUsageIndex } from "@/types/component-usage-index";
import type { PartialComponentSpec } from "ds-types";
import type { TokenRegistry } from "@/types/token-registry";
const EMPTY_COMPONENT_USAGE_INDEX: ComponentUsageIndex = { by_slug: {} };

interface ComponentDetailViewModel {
  // Data
  loading: boolean;
  error: string | null;
  item: ComponentRegistryItem | null;
  usage: ComponentUsageEntry | null;
  allItems: ComponentRegistryItem[];
  spec: PartialComponentSpec | null;
  hasEditorialSpec: boolean;
  isEditorialSpecStatusUnknown: boolean;
  tokenRegistry: TokenRegistry | null;
  downloadError: string | null;
  downloadWarnings: string[];

  // UI state
  captureModalOpen: boolean;
  captureSummary: string | null;
  canOpenDocs: boolean;
  isDownloadingMarkdown: boolean;

  // Derived
  previousItem: ComponentRegistryItem | null;
  nextItem: ComponentRegistryItem | null;
  currentIndex: number;
  totalItems: number;

  // Handlers
  setCaptureModalOpen: (open: boolean) => void;
  setCaptureSummary: (summary: string | null) => void;
  handleReload: () => void;
  handleNavigate: (slug: string) => void;
  handleBack: () => void;
  downloadMarkdown: () => Promise<void>;
}

export function useComponentDetail(): ComponentDetailViewModel {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const [item, setItem] = useState<ComponentRegistryItem | null>(null);
  const [usage, setUsage] = useState<ComponentUsageEntry | null>(null);
  const [allItems, setAllItems] = useState<ComponentRegistryItem[]>([]);
  const [spec, setSpec] = useState<PartialComponentSpec | null>(null);
  const [hasEditorialSpec, setHasEditorialSpec] = useState(false);
  const [isEditorialSpecStatusUnknown, setIsEditorialSpecStatusUnknown] = useState(false);
  const [tokenRegistry, setTokenRegistry] = useState<TokenRegistry | null>(null);
  const [captureModalOpen, setCaptureModalOpen] = useState(false);
  const [captureSummary, setCaptureSummary] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDownloadingMarkdown, setIsDownloadingMarkdown] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadWarnings, setDownloadWarnings] = useState<string[]>([]);

  useEffect(() => {
    setCaptureSummary(null);
    setDownloadError(null);
    setDownloadWarnings([]);
    setIsDownloadingMarkdown(false);
    setIsEditorialSpecStatusUnknown(false);
  }, [slug]);

  useEffect(() => {
    if (!slug) return;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [registry, usageIndex, specResult, tokenRegistryPayload] =
          await Promise.all([
            fetchComponentRegistry(),
            fetchComponentUsageIndex().catch(() => EMPTY_COMPONENT_USAGE_INDEX),
            fetchComponentSpec(slug)
              .then((payload) => ({ ok: true as const, payload }))
              .catch((cause) => ({ ok: false as const, cause })),
            fetchTokenRegistry().catch(() => null),
          ]);
        const found = registry.components.find((c) => c.slug === slug) ?? null;
        setItem(found);
        setAllItems(registry.components);
        setUsage(usageIndex.by_slug[slug] ?? null);

        // Spec comes complete from API (DB-first, no merge needed)
        if (specResult.ok && specResult.payload?.ok) {
          setSpec(specResult.payload.spec ?? null);
          setHasEditorialSpec(specResult.payload.exists === true);
          setIsEditorialSpecStatusUnknown(false);
        } else if (specResult.ok) {
          setSpec(null);
          setHasEditorialSpec(false);
          setIsEditorialSpecStatusUnknown(false);
        } else {
          setSpec(null);
          // Preserve markdown access when spec availability cannot be verified.
          setIsEditorialSpecStatusUnknown(true);
        }

        setTokenRegistry(tokenRegistryPayload);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [slug, reloadNonce]);

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
    tokenRegistry,
    downloadError,
    downloadWarnings,
    captureModalOpen,
    captureSummary,
    canOpenDocs: Boolean(item),
    isDownloadingMarkdown,
    previousItem,
    nextItem,
    currentIndex,
    totalItems,
    setCaptureModalOpen,
    setCaptureSummary,
    handleReload,
    handleNavigate,
    handleBack,
    downloadMarkdown,
  };
}
