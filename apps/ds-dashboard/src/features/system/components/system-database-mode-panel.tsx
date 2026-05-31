import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { DatabaseProvider, DesignSystemConfigEntry } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  databaseProviderLabel,
  databaseProviderOptions,
} from '../lib/database-provider-meta';

function hasDatabaseProvider(
  value: DatabaseProvider | null,
): value is DatabaseProvider {
  return value !== null;
}

export function SystemDatabaseModePanel({
  system,
}: {
  system: Pick<DesignSystemConfigEntry, 'id' | 'name' | 'databaseProvider'>;
}) {
  const provider = system.databaseProvider ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Database mode</CardTitle>
        <CardDescription>
          Database mode recorded with this design system. This does not change
          the dashboard-wide connection.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 md:grid-cols-3">
          {databaseProviderOptions.map((option) => {
            const selected = provider === option.value;
            return (
              <div
                key={option.value}
                className={cn(
                  'rounded-md border p-3 text-left transition duration-fast',
                  selected
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border bg-surface-2 text-muted-foreground',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{option.label}</span>
                  {selected ? <Badge variant="success">Active</Badge> : null}
                </div>
                <span className="mt-1 block text-xs">{option.description}</span>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground">
          {hasDatabaseProvider(provider) ? (
            <>
              Recorded with <strong>{databaseProviderLabel(provider)}</strong>.
            </>
          ) : (
            <>
              Database mode has not been recorded yet for{' '}
              <strong>{system.name || system.id}</strong>.
            </>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
