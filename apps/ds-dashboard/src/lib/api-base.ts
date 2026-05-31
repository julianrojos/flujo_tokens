function normalizeConfiguredUrl(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\/$/, '') : '';
}

export function getDashboardApiBaseUrl(): string {
  const env = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env;
  return normalizeConfiguredUrl(env?.VITE_API_URL) || '';
}
