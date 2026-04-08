import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { getAiProviderHealth } from '@/lib/ai-jobs-api';
import type { AiProviderName } from '@/types/ai-jobs';

interface UseAiProviderHealthArgs {
  provider: AiProviderName;
  model?: string;
  figmaUrl?: string;
  enabled?: boolean;
}

const HEALTH_INPUT_DEBOUNCE_MS = 400;

export function useAiProviderHealth({
  provider,
  model,
  figmaUrl,
  enabled = true,
}: UseAiProviderHealthArgs) {
  const normalizedModel = String(model || '').trim();
  const normalizedFigmaUrl = String(figmaUrl || '').trim();
  const [debouncedModel, setDebouncedModel] = useState(normalizedModel);
  const [debouncedFigmaUrl, setDebouncedFigmaUrl] = useState(normalizedFigmaUrl);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedModel(normalizedModel);
    }, HEALTH_INPUT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [normalizedModel]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedFigmaUrl(normalizedFigmaUrl);
    }, HEALTH_INPUT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [normalizedFigmaUrl]);

  return useQuery({
    queryKey: ['ai-provider-health', provider, debouncedModel, debouncedFigmaUrl],
    queryFn: () =>
      getAiProviderHealth({
        provider,
        ...(debouncedModel ? { model: debouncedModel } : {}),
        ...(debouncedFigmaUrl ? { figmaUrl: debouncedFigmaUrl } : {}),
      }),
    enabled,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    staleTime: 10_000,
  });
}
