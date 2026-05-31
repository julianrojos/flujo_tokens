import type { DatabaseProvider } from '@/lib/api';

export const databaseProviderOptions: Array<{
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

export function databaseProviderLabel(provider: DatabaseProvider): string {
  switch (provider) {
    case 'local':
      return 'Local Postgres';
    case 'supabase':
      return 'Supabase';
    default:
      return 'Custom Postgres';
  }
}
