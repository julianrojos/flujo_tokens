/**
 * AiJobCreateForm Component
 * Form for creating AI documentation generation jobs
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { StatusAlert } from '@/components/ui/status-alert';
import {
  getAiConfiguredProviders,
} from '@/lib/ai-jobs-api';
import { useAiJobCreate } from '@/hooks/use-ai-job-create';
import { useAiProviderHealth } from '@/hooks/use-ai-provider-health';
import type {
  AiHealthStatus,
  AiProviderName,
  DocStatus,
} from '@/types/ai-jobs';
import {
  AI_PROVIDER_LABELS,
  AI_PROVIDER_ORDER,
} from '@/types/ai-provider-catalog';

export interface AiJobComponentOption {
  value: string;
  label: string;
}

interface AiJobCreateFormProps {
  /** Optional pre-filled component ID */
  initialComponentId?: string;
  /** When set, hides the component selector and locks to this componentId */
  lockedComponentId?: string;
  /** Component options sourced from DB */
  componentOptions?: AiJobComponentOption[];
  /** Optional pre-filled provider */
  initialProvider?: AiProviderName;
  /** Optional pre-filled model */
  initialModel?: string;
  /** Optional system prompt override */
  systemPrompt?: string;
  /** Optional user prompt override */
  userPrompt?: string;
  /** Callback when job is created */
  onJobCreated?: (jobId: string) => void;
  /** Callback when the selected component changes internally */
  onComponentIdChange?: (id: string) => void;
  /** Existing doc status for the currently selected component */
  existingDocStatus?: DocStatus;
  /** Whether existing doc status is still loading */
  isDocStatusLoading?: boolean;
  /** Optional form id to allow external submit buttons */
  formId?: string;
  /** Hide internal submit button to render actions externally */
  hideSubmitButton?: boolean;
  /** Emits submit state for external actions */
  onSubmitStateChange?: (state: {
    disabled: boolean;
    pending: boolean;
  }) => void;
}

const PROVIDER_OPTIONS: { value: AiProviderName; label: string }[] =
  AI_PROVIDER_ORDER.map((value) => ({
    value,
    label: AI_PROVIDER_LABELS[value],
  }));

const DEFAULT_MODELS: Record<AiProviderName, string> = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o-mini-2024-07-18',
  openrouter: 'google/gemma-4-26b-a4b-it',
  gemini: 'gemini-2.0-flash',
  ollama: 'llama3.2',
};

function toneToVariant(
  tone: AiHealthStatus | undefined,
): 'success' | 'warning' | 'error' | 'neutral' {
  if (tone === 'ready') return 'success';
  if (tone === 'warning') return 'warning';
  if (tone === 'error') return 'error';
  return 'neutral';
}

export function AiJobCreateForm({
  initialComponentId = '',
  lockedComponentId,
  componentOptions = [],
  initialProvider,
  initialModel,
  systemPrompt,
  userPrompt,
  onJobCreated,
  onComponentIdChange,
  existingDocStatus,
  isDocStatusLoading = false,
  formId,
  hideSubmitButton = false,
  onSubmitStateChange,
}: AiJobCreateFormProps) {
  const [provider, setProvider] = useState<AiProviderName>(
    initialProvider || 'ollama',
  );
  const [componentId, setComponentId] = useState(
    lockedComponentId || initialComponentId,
  );
  const [model, setModel] = useState(initialModel || '');
  const [runValidation, setRunValidation] = useState(false);
  const [providerTouched, setProviderTouched] = useState(false);
  const [overwriteAcknowledged, setOverwriteAcknowledged] = useState(false);

  const handleProviderChange = useCallback(
    (nextProvider: AiProviderName) => {
      setProviderTouched(true);
      setProvider(nextProvider);
    },
    [],
  );

  const { data: configuredProviders, isFetched: configuredProvidersLoaded } =
    useQuery({
      queryKey: ['ai-configured-providers'],
      queryFn: getAiConfiguredProviders,
      staleTime: 60_000,
    });

  // Sync state when initial props change (e.g., from "Re-generar" or retry)
  useEffect(() => {
    if (lockedComponentId) {
      setComponentId(lockedComponentId);
    } else if (initialComponentId) {
      setComponentId(initialComponentId);
    }
  }, [lockedComponentId, initialComponentId]);

  useEffect(() => {
    if (initialProvider) {
      setProvider(initialProvider);
      setProviderTouched(false);
    }
  }, [initialProvider]);

  useEffect(() => {
    if (initialModel !== undefined) {
      setModel(initialModel);
    }
  }, [initialModel]);

  // Reset acknowledgement when selected component changes
  useEffect(() => {
    setOverwriteAcknowledged(false);
  }, [componentId, existingDocStatus]);

  useEffect(() => {
    if (initialProvider) return;
    if (providerTouched) return;
    const preferred = configuredProviders?.defaultProvider;
    if (preferred) {
      setProvider(preferred);
    }
  }, [configuredProviders?.defaultProvider, initialProvider, providerTouched]);

  const {
    data: providerHealth,
    isLoading: isHealthLoading,
    isFetching: isHealthFetching,
    error: healthError,
    refetch: refetchProviderHealth,
  } = useAiProviderHealth({
    provider,
    model,
    enabled:
      Boolean(provider) &&
      (configuredProvidersLoaded || Boolean(initialProvider)),
  });

  const { mutate, isPending, error, reset } = useAiJobCreate({
    onSuccess: (jobId) => {
      onJobCreated?.(jobId);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!isFormValid || !componentId.trim()) {
      return;
    }

    // Reset error on submit
    reset();

    mutate({
      provider,
      componentId: componentId.trim(),
      model: model.trim() || undefined,
      systemPrompt:
        systemPrompt && systemPrompt.trim().length > 0
          ? systemPrompt
          : undefined,
      userPrompt:
        userPrompt && userPrompt.trim().length > 0 ? userPrompt : undefined,
      runValidation,
    });
  };

  const isValid = componentId.trim().length > 0 && !isPending;
  const needsAcknowledgement = existingDocStatus === 'fresh';
  const isFormValid =
    isValid &&
    !isDocStatusLoading &&
    (!needsAcknowledgement || overwriteAcknowledged);
  const selectedComponentIsKnown = componentOptions.some(
    (option) => option.value === componentId,
  );
  const shouldShowFallbackOption =
    componentId.trim().length > 0 && !selectedComponentIsKnown;
  const lastSubmitStateRef = useRef<{
    disabled: boolean;
    pending: boolean;
  } | null>(null);

  useEffect(() => {
    if (!onSubmitStateChange) return;
    const nextState = { disabled: !isFormValid, pending: isPending };
    const last = lastSubmitStateRef.current;
    if (
      last &&
      last.disabled === nextState.disabled &&
      last.pending === nextState.pending
    ) {
      return;
    }
    lastSubmitStateRef.current = nextState;
    onSubmitStateChange(nextState);
  }, [isFormValid, isPending, onSubmitStateChange]);

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-4">
      {/* Provider Selection */}
      <div className="space-y-2">
        <label htmlFor="provider" className="text-sm font-medium">
          AI Provider
        </label>
        <Select
          id="provider"
          value={provider}
          onChange={(e) => {
            handleProviderChange(e.target.value as AiProviderName);
          }}
          disabled={isPending}
          className="w-full"
        >
          {PROVIDER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </div>

      {/* Model (optional) */}
      <div className="space-y-2">
        <label htmlFor="model" className="text-sm font-medium">
          Model (optional)
        </label>
        <Input
          id="model"
          type="text"
          placeholder={`Default: ${DEFAULT_MODELS[provider]}`}
          value={model}
          onChange={(e) => {
            setModel(e.target.value);
          }}
          disabled={isPending}
        />
      </div>

      {/* Component ID */}
      {!lockedComponentId && (
        <div className="space-y-2">
          <label htmlFor="componentId" className="text-sm font-medium">
            Component <span className="text-destructive">*</span>
          </label>
          <Select
            id="componentId"
            value={componentId}
            onChange={(e) => {
              const id = e.target.value;
              setComponentId(id);
              onComponentIdChange?.(id);
            }}
            disabled={isPending || componentOptions.length === 0}
            required
            className="w-full"
          >
            {shouldShowFallbackOption ? (
              <option value={componentId}>
                Current selection: {componentId}
              </option>
            ) : null}
            <option value="" disabled>
              {componentOptions.length === 0
                ? 'No components available'
                : 'Select a component'}
            </option>
            {componentOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      )}

      <div className="flex items-start gap-2">
        <input
          id="runValidation"
          type="checkbox"
          checked={runValidation}
          onChange={(e) => setRunValidation(e.target.checked)}
          disabled={isPending}
          className="mt-0.5 rounded border-border"
        />
        <div className="space-y-1">
          <label htmlFor="runValidation" className="text-sm font-medium">
            Run quality validation (slower)
          </label>
          <p className="text-xs text-muted-foreground">
            When enabled, runs the final validation step and shows quality
            issues.
          </p>
        </div>
      </div>

      {healthError ? (
        <StatusAlert
          variant="warning"
          title="Unable to check AI readiness"
          description={
            healthError.message || 'Health check is temporarily unavailable.'
          }
        />
      ) : (
        <div className="rounded-md border border-border/70 bg-muted/30 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Readiness checks</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                void refetchProviderHealth();
              }}
              disabled={isHealthLoading || isHealthFetching}
              className="h-6 px-2 text-xs"
            >
              {isHealthFetching ? 'Checking…' : 'Recheck'}
            </Button>
          </div>
          {isHealthLoading ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Checking provider and plugin status…
            </p>
          ) : providerHealth ? (
            <div className="mt-2 space-y-2">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span>Figma plugin</span>
                <Badge
                  variant={toneToVariant(providerHealth.checks.figma.status)}
                >
                  {providerHealth.checks.figma.status}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {providerHealth.checks.figma.message}
              </p>

              <div className="flex items-center justify-between gap-2 text-sm">
                <span>AI provider</span>
                <Badge
                  variant={toneToVariant(providerHealth.checks.provider.status)}
                >
                  {providerHealth.checks.provider.status}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {providerHealth.checks.provider.message}
              </p>

              <div className="flex items-center justify-between gap-2 text-sm">
                <span>Model</span>
                <Badge
                  variant={toneToVariant(providerHealth.checks.model.status)}
                >
                  {providerHealth.checks.model.status}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {providerHealth.checks.model.message}
              </p>

              {!providerHealth.overallReady ? (
                <StatusAlert
                  variant="warning"
                  description="Some checks are not ready yet. Generation may fail until they are resolved."
                />
              ) : null}
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              Health check pending…
            </p>
          )}
        </div>
      )}

      {/* Error Display */}
      {error && (
        <StatusAlert
          variant="error"
          title="Failed to create job"
          description={error.message || 'Failed to create job'}
        />
      )}

      {/* Existing doc status notice */}
      {isDocStatusLoading && componentId.trim().length > 0 && (
        <StatusAlert
          variant="info"
          title="Comprobando documentación existente…"
          description="El botón de generación se habilitará cuando se confirme el estado."
        />
      )}
      {!isDocStatusLoading && existingDocStatus === 'stale' && (
        <StatusAlert
          variant="info"
          title="Este componente ya tiene documentación"
          description="Generar de nuevo creará un borrador nuevo — la documentación actual solo se sobrescribirá si aplicas los cambios."
        />
      )}
      {!isDocStatusLoading && existingDocStatus === 'fresh' && (
        <StatusAlert
          variant="warning"
          title="Este componente ya tiene documentación actualizada"
          description={
            <div className="space-y-2">
              <p>
                Generar de nuevo sobrescribirá la documentación existente si
                aplicas los cambios.
              </p>
              <div className="flex items-center gap-2">
                <input
                  id="overwriteAck"
                  type="checkbox"
                  checked={overwriteAcknowledged}
                  onChange={(e) => setOverwriteAcknowledged(e.target.checked)}
                  disabled={isPending}
                  className="rounded border-border"
                />
                <label htmlFor="overwriteAck" className="text-sm">
                  Confirmar sobrescritura de documentación existente
                </label>
              </div>
            </div>
          }
        />
      )}

      {!hideSubmitButton && (
        <div className="flex flex-col gap-2">
          <Button type="submit" disabled={!isFormValid}>
            {isPending ? 'Creating Job...' : 'Generate Documentation'}
          </Button>
        </div>
      )}
    </form>
  );
}
