import { Database, RefreshCw, Server } from 'lucide-react';

import { ApiErrorMessage } from '@/components/api-error-message';
import { FormField } from '@/components/common';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { StatusAlert } from '@/components/ui/status-alert';
import type {
  DatabaseConfig,
  DatabaseProvider,
  DatabaseValidationResult,
} from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  DEFAULT_LOCAL_DATABASE_URL,
  useDatabaseConfigPanel,
} from '../hooks/use-database-config-panel';

const providerOptions: Array<{
  value: DatabaseProvider;
  label: string;
  description: string;
}> = [
  {
    value: 'local',
    label: 'Local Postgres',
    description: 'Development database on localhost.',
  },
  {
    value: 'supabase',
    label: 'Supabase',
    description: 'Hosted Postgres with SSL.',
  },
  {
    value: 'custom',
    label: 'Custom Postgres',
    description: 'Any compatible Postgres URL.',
  },
];

function statusText(config: DatabaseConfig | null): string {
  if (!config) return 'Loading database configuration...';
  if (config.restartRequired) {
    return `Restart required. Active: ${config.activeProvider}; saved: ${config.provider}.`;
  }
  return `Active: ${config.activeProvider}.`;
}

function databaseUrlPlaceholder({
  provider,
  savedDatabaseUrlMasked,
}: {
  provider: DatabaseProvider;
  savedDatabaseUrlMasked: string;
}): string {
  if (savedDatabaseUrlMasked) return savedDatabaseUrlMasked;
  if (provider === 'supabase') {
    return 'postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require';
  }
  return DEFAULT_LOCAL_DATABASE_URL;
}

function ProviderSelector({
  provider,
  disabled,
  onChange,
}: {
  provider: DatabaseProvider;
  disabled: boolean;
  onChange: (provider: DatabaseProvider) => void;
}) {
  return (
    <fieldset className="grid gap-2 md:grid-cols-3">
      <legend className="sr-only">Database provider</legend>
      {providerOptions.map((option) => {
        const selected = provider === option.value;
        return (
          <label
            key={option.value}
            className={cn(
              'rounded-md border p-3 text-left transition duration-fast',
              disabled
                ? 'cursor-not-allowed opacity-60'
                : 'cursor-pointer focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
              selected
                ? 'border-primary bg-primary/10 text-foreground'
                : 'border-border bg-surface-2 text-muted-foreground hover:border-primary/60 hover:text-foreground',
            )}
          >
            <input
              type="radio"
              name="database-provider"
              value={option.value}
              checked={selected}
              onChange={() => onChange(option.value)}
              disabled={disabled}
              className="sr-only"
            />
            <span className="block text-sm font-semibold">{option.label}</span>
            <span className="mt-1 block text-xs">{option.description}</span>
          </label>
        );
      })}
    </fieldset>
  );
}

function ConnectionNotice({
  validation,
}: {
  validation: DatabaseValidationResult | null;
}) {
  if (!validation) return null;
  return (
    <StatusAlert variant="success" title="Connection verified" role="status">
      <p className="mt-1 text-xs">
        {validation.database} as {validation.user}. SSL{' '}
        {validation.ssl ? 'enabled' : 'not enabled'}; prepared statements{' '}
        {validation.preparedStatements ? 'enabled' : 'disabled'}.
      </p>
      {!validation.vectorExtensionInstalled ? (
        <p className="mt-1 text-xs">
          pgvector is not installed yet. The dashboard migrations will try to
          enable it on restart.
        </p>
      ) : null}
    </StatusAlert>
  );
}

function RestartNotice({ config }: { config: DatabaseConfig | null }) {
  if (!config?.restartRequired) return null;
  return (
    <StatusAlert variant="warning" title="Restart required">
      <p className="mt-1 text-xs">
        Saved configuration points to {config.databaseUrlMasked}. Active
        connection is still {config.activeDatabaseUrlMasked}.
      </p>
    </StatusAlert>
  );
}

function DatabaseActions({
  showRestart,
  isBusy,
  isValidating,
  isSaving,
  isRestarting,
  onValidate,
  onSave,
  onRestart,
}: {
  showRestart: boolean;
  isBusy: boolean;
  isValidating: boolean;
  isSaving: boolean;
  isRestarting: boolean;
  onValidate: () => void;
  onSave: () => void;
  onRestart: () => void;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Button
        type="button"
        variant="outline"
        onClick={onValidate}
        disabled={isBusy}
      >
        <Server className="mr-2 h-4 w-4" aria-hidden="true" />
        {isValidating ? 'Testing...' : 'Test connection'}
      </Button>
      <Button type="button" onClick={onSave} disabled={isBusy}>
        {isSaving ? 'Saving...' : 'Save database'}
      </Button>
      {showRestart ? (
        <Button
          type="button"
          variant="outline"
          onClick={onRestart}
          disabled={isRestarting}
        >
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
          {isRestarting ? 'Restarting...' : 'Restart API'}
        </Button>
      ) : null}
    </div>
  );
}

export function DatabaseConfigPanel() {
  const state = useDatabaseConfigPanel();
  const isBusy = state.isLoading || state.isSaving || state.isValidating;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-4 w-4" aria-hidden="true" />
          Database
        </CardTitle>
        <CardDescription>{statusText(state.config)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {state.error ? <ApiErrorMessage error={state.error} /> : null}
        <ProviderSelector
          provider={state.provider}
          disabled={isBusy}
          onChange={state.handleProviderChange}
        />
        <FormField
          id="database-url"
          label={
            state.provider === 'supabase'
              ? 'Supabase Postgres URL'
              : 'Database URL'
          }
          hint={
            state.provider === 'supabase'
              ? state.savedDatabaseUrlMasked
                ? 'Leave empty to use the saved Supabase connection. Paste a full URL only to replace it.'
                : 'Use the direct Postgres or pooler connection string from Supabase. Include sslmode=require when available.'
              : undefined
          }
        >
          <Input
            id="database-url"
            value={state.databaseUrl}
            onChange={(event) => state.setDatabaseUrl(event.target.value)}
            placeholder={databaseUrlPlaceholder({
              provider: state.provider,
              savedDatabaseUrlMasked: state.savedDatabaseUrlMasked,
            })}
            disabled={isBusy}
          />
        </FormField>
        <ConnectionNotice validation={state.validation} />
        <RestartNotice config={state.config} />
        <DatabaseActions
          showRestart={Boolean(state.config?.restartRequired)}
          isBusy={isBusy}
          isValidating={state.isValidating}
          isSaving={state.isSaving}
          isRestarting={state.isRestarting}
          onValidate={() => void state.handleValidate()}
          onSave={() => void state.handleSave()}
          onRestart={() => void state.handleRestart()}
        />
      </CardContent>
    </Card>
  );
}
