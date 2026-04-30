function normalizeConfiguredUrl(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\/$/, '') : '';
}

export function getDashboardApiBaseUrl(): string {
  return normalizeConfiguredUrl(import.meta.env.VITE_API_URL) || '';
}
