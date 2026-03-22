/**
 * useOperationsArtifacts hook - encapsulates artifact state + refresh.
 */

import { useState, useCallback } from "react";
import type { ArtifactMeta, ArtifactId } from "../lib/operations-artifacts";
import { INITIAL_ARTIFACTS, fetchArtifactMeta, staleness } from "../lib/operations-artifacts";

export interface UseOperationsArtifactsResult {
  artifacts: ArtifactMeta[];
  isRefreshing: boolean;
  refreshStatuses: () => Promise<void>;
}

export function useOperationsArtifacts(): UseOperationsArtifactsResult {
  const [artifacts, setArtifacts] = useState<ArtifactMeta[]>(INITIAL_ARTIFACTS);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshStatuses = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const updates = await Promise.all(
        (["registry", "usage", "health", "graph"] as ArtifactId[]).map((id) =>
          fetchArtifactMeta(id).then((meta) => ({ id, ...meta }))
        )
      );
      setArtifacts((prev) =>
        prev.map((a) => {
          const update = updates.find((u) => u.id === a.id);
          if (!update) return a;
          return {
            ...a,
            generatedAt: update.generatedAt,
            summary: update.summary,
            isStale: staleness(update.generatedAt),
          };
        })
      );
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  return { artifacts, isRefreshing, refreshStatuses };
}
