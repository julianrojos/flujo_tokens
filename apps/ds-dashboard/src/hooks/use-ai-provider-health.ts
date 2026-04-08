import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { getAiProviderHealth } from '@/lib/ai-jobs-api';
import type { AiProviderName } from '@/types/ai-jobs';

interface UseAiProviderHealthArgs {
  provider: AiProviderName;
  model?: string;
  enabled?: boolean;
}

const HEALTH_INPUT_DEBOUNCE_MS = 400;

export function useAiProviderHealth({
  provider,
  model,
  enabled = true,
}: UseAiProviderHealthArgs) {
  const normalizedModel = String(model || '').trim();
  const [debouncedModel, setDebouncedModel] = useState(normalizedModel);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedModel(normalizedModel);
    }, HEALTH_INPUT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [normalizedModel]);

  return useQuery({
    queryKey: ['ai-provider-health', provider, debouncedModel],
    queryFn: () =>
      getAiProviderHealth({
        provider,
        ...(debouncedModel ? { model: debouncedModel } : {}),
      }),
    enabled,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    staleTime: 10_000,
  });
}
