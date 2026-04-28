import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  fetchDatabaseConfig,
  restartApiServer,
  saveDatabaseConfig,
  validateDatabaseConfig,
  type DatabaseConfig,
  type DatabaseProvider,
  type DatabaseValidationResult,
} from '@/lib/api';
import { toApiErrorDisplay, type ApiErrorDisplay } from '@/lib/api-error-ux';

export const DEFAULT_LOCAL_DATABASE_URL =
  'postgres://ds:local@localhost:5432/ds_dashboard';

const databaseConfigQueryKey = ['database-config'] as const;

function defaultUrlForProvider(provider: DatabaseProvider): string {
  return provider === 'local' ? DEFAULT_LOCAL_DATABASE_URL : '';
}

function hasSavedUrlForProvider(
  config: DatabaseConfig | null,
  provider: DatabaseProvider,
): boolean {
  return Boolean(config?.databaseUrlConfigured && config.provider === provider);
}

export function getDatabaseUrlForProviderChange(args: {
  currentDatabaseUrl: string;
  nextProvider: DatabaseProvider;
  isDraftDirty: boolean;
}): string {
  return args.isDraftDirty
    ? args.currentDatabaseUrl
    : defaultUrlForProvider(args.nextProvider);
}

export function shouldRestartAfterSave(args: {
  saveResponse: Pick<DatabaseConfig, 'restartRequired' | 'provider'>;
  requestedProvider: DatabaseProvider;
}): boolean {
  return (
    args.saveResponse.restartRequired ||
    args.requestedProvider !== args.saveResponse.provider
  );
}

function buildLocalValidationError(message: string): ApiErrorDisplay {
  return {
    title: 'Database URL required',
    message,
    reason: null,
    action: null,
    requestId: null,
    code: null,
    retryable: true,
  };
}

function toConfigError(cause: unknown): ApiErrorDisplay {
  return toApiErrorDisplay(cause, {
    fallbackTitle: 'Database config unavailable',
    fallbackMessage: 'Unable to load database configuration.',
  });
}

export interface DatabaseConfigPanelState {
  config: DatabaseConfig | null;
  provider: DatabaseProvider;
  databaseUrl: string;
  savedDatabaseUrlMasked: string;
  validation: DatabaseValidationResult | null;
  error: ApiErrorDisplay | null;
  isLoading: boolean;
  isValidating: boolean;
  isSaving: boolean;
  isRestarting: boolean;
  canSubmit: boolean;
  setDatabaseUrl: (value: string) => void;
  handleProviderChange: (provider: DatabaseProvider) => void;
  handleValidate: () => Promise<void>;
  handleApplyChanges: () => Promise<void>;
}

export function useDatabaseConfigPanel(): DatabaseConfigPanelState {
  const queryClient = useQueryClient();
  const [provider, setProvider] = useState<DatabaseProvider>('local');
  const [databaseUrl, setDatabaseUrlState] = useState(
    DEFAULT_LOCAL_DATABASE_URL,
  );
  const hasHydratedRef = useRef(false);
  const isDraftDirtyRef = useRef(false);
  const [validation, setValidation] = useState<DatabaseValidationResult | null>(
    null,
  );
  const [localError, setLocalError] = useState<ApiErrorDisplay | null>(null);

  const configQuery = useQuery({
    queryKey: databaseConfigQueryKey,
    queryFn: fetchDatabaseConfig,
  });
  const config = configQuery.data?.config ?? null;

  useEffect(() => {
    if (!config) return;
    if (hasHydratedRef.current && isDraftDirtyRef.current) return;
    setProvider(config.provider);
    setDatabaseUrlState(
      config.databaseUrlConfigured
        ? ''
        : defaultUrlForProvider(config.provider),
    );
    hasHydratedRef.current = true;
    isDraftDirtyRef.current = false;
  }, [config]);

  const validateMutation = useMutation({
    mutationFn: validateDatabaseConfig,
    onSuccess: (response) => {
      setLocalError(null);
      setValidation(response.result);
    },
    onError: (cause) => {
      setValidation(null);
      setLocalError(
        toApiErrorDisplay(cause, {
          fallbackTitle: 'Connection failed',
          fallbackMessage: 'Unable to connect to the selected database.',
        }),
      );
    },
  });

  const saveMutation = useMutation({
    mutationFn: saveDatabaseConfig,
    onSuccess: (response) => {
      setLocalError(null);
      setValidation(null);
      isDraftDirtyRef.current = false;
      hasHydratedRef.current = true;
      setProvider(response.config.provider);
      setDatabaseUrlState(
        response.config.databaseUrlConfigured
          ? ''
          : defaultUrlForProvider(response.config.provider),
      );
      queryClient.setQueryData(databaseConfigQueryKey, response);
    },
    onError: (cause) => {
      setLocalError(
        toApiErrorDisplay(cause, {
          fallbackTitle: 'Save failed',
          fallbackMessage: 'Unable to save database configuration.',
        }),
      );
    },
  });

  const restartMutation = useMutation({
    mutationFn: restartApiServer,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: databaseConfigQueryKey });
    },
    onError: (cause) => {
      setLocalError(
        toApiErrorDisplay(cause, {
          fallbackTitle: 'Restart required',
          fallbackMessage:
            config?.restartCommand ||
            'Restart the dashboard server from your terminal.',
        }),
      );
    },
  });

  const canSubmit = useMemo(
    () =>
      (Boolean(databaseUrl.trim()) && !databaseUrl.includes('***')) ||
      hasSavedUrlForProvider(config, provider),
    [config, databaseUrl, provider],
  );

  const setDatabaseUrl = (value: string) => {
    isDraftDirtyRef.current = true;
    setDatabaseUrlState(value);
    setValidation(null);
  };

  const handleProviderChange = (nextProvider: DatabaseProvider) => {
    const nextDatabaseUrl = getDatabaseUrlForProviderChange({
      currentDatabaseUrl: databaseUrl,
      nextProvider,
      isDraftDirty: isDraftDirtyRef.current,
    });
    isDraftDirtyRef.current = true;
    setProvider(nextProvider);
    setValidation(null);
    setLocalError(null);
    setDatabaseUrlState(
      hasSavedUrlForProvider(config, nextProvider)
        ? ''
        : nextDatabaseUrl,
    );
  };

  const handleValidate = async () => {
    if (!canSubmit) {
      setLocalError(
        buildLocalValidationError(
          'Paste the full database URL before testing the connection.',
        ),
      );
      return;
    }
    setLocalError(null);
    setValidation(null);
    await validateMutation.mutateAsync({
      provider,
      databaseUrl: databaseUrl.trim(),
    });
  };

  const handleApplyChanges = async () => {
    if (!canSubmit) {
      setLocalError(
        buildLocalValidationError('Paste the full database URL before saving.'),
      );
      return;
    }
    setLocalError(null);
    const saveResponse = await saveMutation.mutateAsync({
      provider,
      databaseUrl: databaseUrl.trim(),
    });
    if (
      shouldRestartAfterSave({
        saveResponse: saveResponse.config,
        requestedProvider: provider,
      })
    ) {
      await restartMutation.mutateAsync();
    }
  };

  return {
    config,
    provider,
    databaseUrl,
    validation,
    error:
      localError ||
      (configQuery.error ? toConfigError(configQuery.error) : null),
    isLoading: configQuery.isLoading,
    isValidating: validateMutation.isPending,
    isSaving: saveMutation.isPending,
    isRestarting: restartMutation.isPending,
    canSubmit,
    savedDatabaseUrlMasked:
      config?.databaseUrlConfigured && config.provider === provider
        ? config.databaseUrlMasked
        : '',
    setDatabaseUrl,
    handleProviderChange,
    handleValidate,
    handleApplyChanges,
  };
}
