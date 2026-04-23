/**
 * Hook for component-detail page.
 */

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  fetchComponentCatalog,
  fetchComponentSpec,
  fetchComponentUsageIndex,
  fetchTokenCatalog,
} from "@/lib/api";
import { useDesignSystem } from "@/lib/design-system-context";
import type { ComponentCatalogItem } from "@/types/component-catalog";
import type { ComponentUsageEntry, ComponentUsageIndex } from "@/types/component-usage-index";
import type { PartialComponentSpec } from "ds-types";
import type { TokenCatalog } from "@/types/token-catalog";
const EMPTY_COMPONENT_USAGE_INDEX: ComponentUsageIndex = { by_slug: {} };
const COMPONENT_DETAIL_CACHE_LIMIT = 20;

interface ComponentDetailSnapshot {
  item: ComponentCatalogItem | null;
  usage: ComponentUsageEntry | null;
  allItems: ComponentCatalogItem[];
  spec: PartialComponentSpec | null;
  hasEditorialSpec: boolean;
  isEditorialSpecStatusUnknown: boolean;
  tokenCatalog: TokenCatalog | null;
}

const componentDetailCache = new Map<string, ComponentDetailSnapshot>();
const componentDetailPrefetches = new Map<string, Promise<void>>();

function normalizeCacheKeyPart(value: string | null | undefined): string {
  return String(value || "").trim();
}

function buildComponentDetailCacheKey(systemId: string | null | undefined, slug: string): string {
  return `${normalizeCacheKeyPart(systemId)}:${normalizeCacheKeyPart(slug)}`;
}

function getCachedComponentDetailSnapshot(
  systemId: string | null | undefined,
  slug: string,
): ComponentDetailSnapshot | null {
  return componentDetailCache.get(buildComponentDetailCacheKey(systemId, slug)) ?? null;
}

function setCachedComponentDetailSnapshot(
  systemId: string | null | undefined,
  slug: string,
  snapshot: ComponentDetailSnapshot,
): void {
  const cacheKey = buildComponentDetailCacheKey(systemId, slug);
  if (componentDetailCache.has(cacheKey)) {
    componentDetailCache.delete(cacheKey);
  }
  componentDetailCache.set(cacheKey, snapshot);
  while (componentDetailCache.size > COMPONENT_DETAIL_CACHE_LIMIT) {
    const oldestKey = componentDetailCache.keys().next().value;
    if (oldestKey === undefined) break;
    componentDetailCache.delete(oldestKey);
  }
}

type ComponentDetailPrefetchSource = {
  systemId: string;
  allItems: ComponentCatalogItem[];
  usageIndex: ComponentUsageIndex;
  tokenCatalog: TokenCatalog | null;
};

export async function prefetchComponentDetailSnapshot(
  slug: string,
  source: ComponentDetailPrefetchSource,
): Promise<void> {
  const cacheKey = buildComponentDetailCacheKey(source.systemId, slug);
  if (!slug || componentDetailCache.has(cacheKey) || componentDetailPrefetches.has(cacheKey)) {
    return;
  }

  const inFlight = (async () => {
    try {
      const found = source.allItems.find((item) => item.slug === slug) ?? null;
      if (!found) return;

      const [specResult, tokenCatalogPayload] = await Promise.all([
        fetchComponentSpec(slug)
          .then((payload) => ({ ok: true as const, payload }))
          .catch((cause) => ({ ok: false as const, cause })),
        source.tokenCatalog ? Promise.resolve(source.tokenCatalog) : fetchTokenCatalog().catch(() => null),
      ]);

      if (!specResult.ok || !specResult.payload?.ok) {
        return;
      }

      const snapshot: ComponentDetailSnapshot = {
        item: found,
        usage: source.usageIndex.by_slug[slug] ?? null,
        allItems: source.allItems,
        spec: specResult.payload.spec ?? null,
        hasEditorialSpec: specResult.payload.exists === true,
        isEditorialSpecStatusUnknown: false,
        tokenCatalog: tokenCatalogPayload,
      };

      setCachedComponentDetailSnapshot(source.systemId, slug, snapshot);
    } finally {
      componentDetailPrefetches.delete(cacheKey);
    }
  })();

  componentDetailPrefetches.set(cacheKey, inFlight);
  await inFlight;
}

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
  const { activeSystem } = useDesignSystem();
  const activeSystemId = useMemo(() => normalizeCacheKeyPart(activeSystem), [activeSystem]);
  const requestedCacheKeyRef = useRef<string | undefined>(
    slug ? buildComponentDetailCacheKey(activeSystemId, slug) : undefined,
  );

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
    requestedCacheKeyRef.current = slug
      ? buildComponentDetailCacheKey(activeSystemId, slug)
      : undefined;
  }, [activeSystemId, slug]);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    const requestCacheKey = buildComponentDetailCacheKey(activeSystemId, slug);
    requestedCacheKeyRef.current = requestCacheKey;
    const cachedSnapshot = getCachedComponentDetailSnapshot(activeSystemId, slug);

    if (cachedSnapshot) {
      setItem(cachedSnapshot.item);
      setUsage(cachedSnapshot.usage);
      setAllItems(cachedSnapshot.allItems);
      setSpec(cachedSnapshot.spec);
      setHasEditorialSpec(cachedSnapshot.hasEditorialSpec);
      setIsEditorialSpecStatusUnknown(cachedSnapshot.isEditorialSpecStatusUnknown);
      setTokenCatalog(cachedSnapshot.tokenCatalog);
      setLoading(false);
    }

    const load = async () => {
      if (!cachedSnapshot) {
        setItem(null);
        setUsage(null);
        setAllItems([]);
        setSpec(null);
        setHasEditorialSpec(false);
        setIsEditorialSpecStatusUnknown(false);
        setTokenCatalog(null);
        setLoading(true);
      }
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
        if (cancelled || requestedCacheKeyRef.current !== requestCacheKey) return;
        const found = registry.components.find((c) => c.slug === slug) ?? null;
        if (!found) {
          setItem(null);
          setUsage(null);
          setAllItems(registry.components);
          setSpec(null);
          setHasEditorialSpec(false);
          setIsEditorialSpecStatusUnknown(false);
          setTokenCatalog(tokenCatalogPayload);
          return;
        }

        const nextSnapshot: ComponentDetailSnapshot = {
          item: found,
          usage: usageIndex.by_slug[slug] ?? null,
          allItems: registry.components,
          spec: null,
          hasEditorialSpec: false,
          isEditorialSpecStatusUnknown: false,
          tokenCatalog: tokenCatalogPayload,
        };

        // Spec comes complete from API (DB-first, no merge needed)
        if (specResult.ok && specResult.payload?.ok) {
          nextSnapshot.spec = specResult.payload.spec ?? null;
          nextSnapshot.hasEditorialSpec = specResult.payload.exists === true;
          nextSnapshot.isEditorialSpecStatusUnknown = false;
        } else if (specResult.ok) {
          nextSnapshot.spec = null;
          nextSnapshot.hasEditorialSpec = false;
          nextSnapshot.isEditorialSpecStatusUnknown = false;
        } else {
          nextSnapshot.spec = null;
          // Preserve markdown access when spec availability cannot be verified.
          nextSnapshot.isEditorialSpecStatusUnknown = true;
        }

        setItem(nextSnapshot.item);
        setUsage(nextSnapshot.usage);
        setAllItems(nextSnapshot.allItems);
        setSpec(nextSnapshot.spec);
        setHasEditorialSpec(nextSnapshot.hasEditorialSpec);
        setIsEditorialSpecStatusUnknown(nextSnapshot.isEditorialSpecStatusUnknown);
        setTokenCatalog(nextSnapshot.tokenCatalog);
        setCachedComponentDetailSnapshot(activeSystemId, slug, nextSnapshot);

        const currentIndex = registry.components.findIndex((item) => item.slug === slug);
        const adjacentSlugs = [
          currentIndex > 0 ? registry.components[currentIndex - 1]?.slug : "",
          currentIndex >= 0 && currentIndex < registry.components.length - 1
            ? registry.components[currentIndex + 1]?.slug
            : "",
        ].filter((value): value is string => Boolean(value));

        for (const adjacentSlug of adjacentSlugs) {
          void prefetchComponentDetailSnapshot(adjacentSlug, {
            systemId: activeSystemId,
            allItems: registry.components,
            usageIndex,
            tokenCatalog: tokenCatalogPayload,
          });
        }
      } catch (cause) {
        if (cancelled || requestedCacheKeyRef.current !== requestCacheKey) return;
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        if (cancelled || requestedCacheKeyRef.current !== requestCacheKey) return;
        setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [activeSystemId, slug]);

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
