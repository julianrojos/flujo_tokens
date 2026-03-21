import { useCallback, useEffect, useRef, useState } from "react";

import { getDsFileKey } from "@/lib/api";
import { useDesignSystem } from "@/lib/design-system-context";

export interface UseDsFileKeyResult {
  dsFileKey: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useDsFileKey(): UseDsFileKeyResult {
  const { activeSystem, systems } = useDesignSystem();
  const [dsFileKey, setDsFileKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const keyCacheRef = useRef<Map<string, string | null>>(new Map());

  const refresh = useCallback(async () => {
    setLoading(true);
    const cacheKey = String(activeSystem || "").trim();
    const hasCachedEntry = cacheKey ? keyCacheRef.current.has(cacheKey) : false;
    const cachedValue = hasCachedEntry ? keyCacheRef.current.get(cacheKey) ?? null : undefined;
    if (typeof cachedValue === "string" && cachedValue.trim().length > 0) {
      setDsFileKey(cachedValue);
      setLoading(false);
      return;
    }

    const active = systems.find((system) => system.id === activeSystem);
    const contextFileKey = String(active?.figmaFileId || "").trim();
    if (contextFileKey) {
      setDsFileKey(contextFileKey);
      if (cacheKey) keyCacheRef.current.set(cacheKey, contextFileKey);
      setLoading(false);
      return;
    }
    try {
      const key = await getDsFileKey();
      setDsFileKey(key);
      if (cacheKey) keyCacheRef.current.set(cacheKey, key);
    } catch {
      setDsFileKey(null);
      if (cacheKey) keyCacheRef.current.set(cacheKey, null);
    } finally {
      setLoading(false);
    }
  }, [activeSystem, systems]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { dsFileKey, loading, refresh };
}
