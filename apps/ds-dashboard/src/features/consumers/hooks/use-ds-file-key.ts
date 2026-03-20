import { useCallback, useEffect, useState } from "react";

import { getDsFileKey } from "@/lib/api";
import { useDesignSystem } from "@/lib/design-system-context";

export interface UseDsFileKeyResult {
  dsFileKey: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useDsFileKey(): UseDsFileKeyResult {
  const { activeSystem } = useDesignSystem();
  const [dsFileKey, setDsFileKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const key = await getDsFileKey();
    setDsFileKey(key);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [activeSystem, refresh]);

  return { dsFileKey, loading, refresh };
}

