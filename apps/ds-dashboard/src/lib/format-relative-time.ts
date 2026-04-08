/**
 * Format a timestamp as a human-readable relative time string.
 */

export interface FormatRelativeTimeOptions {
  locale?: 'es' | 'en';
}

/**
 * Format a timestamp (ISO string or epoch ms) as relative time.
 *
 * @param value — ISO date string, epoch milliseconds, or undefined/null
 * @param options.locale — "es" for Spanish (default), "en" for English
 *
 * Default locale is intentionally "es" because /ops UI copy is Spanish-first.
 * Pass { locale: "en" } explicitly for English-only contexts (e.g. AI job timeline).
 *
 * Spanish mode: handles past and future with Intl.RelativeTimeFormat.
 * English mode: compact relative format for both past and future.
 */
export function formatRelativeTime(
  value: string | number | undefined | null,
  options?: FormatRelativeTimeOptions,
): string {
  const locale = options?.locale ?? 'es';

  const date =
    typeof value === 'string' ? new Date(value) :
    typeof value === 'number' ? new Date(value) :
    null;
  if (!date || isNaN(date.getTime())) return locale === 'es' ? 'Nunca' : 'Never';

  const diffMs = date.getTime() - Date.now();
  const absMs = Math.abs(diffMs);
  const past = diffMs <= 0;

  if (locale === 'es') {
    const formatter = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });

    if (absMs < 60_000) {
      const secs = Math.round(absMs / 1000);
      return past ? `hace ${secs}s` : `en ${secs}s`;
    }
    if (absMs < 3_600_000) {
      const mins = Math.round(absMs / 60_000);
      return formatter.format(past ? -mins : mins, 'minute');
    }
    if (absMs < 86_400_000) {
      const hours = Math.round(absMs / 3_600_000);
      return formatter.format(past ? -hours : hours, 'hour');
    }
    const days = Math.round(absMs / 86_400_000);
    return formatter.format(past ? -days : days, 'day');
  }

  // English: compact relative format used by timelines and status rows.
  const seconds = Math.floor(absMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const inPrefix = past ? '' : 'in ';
  const suffix = past ? ' ago' : '';

  if (seconds < 60) return `${inPrefix}${seconds}s${suffix}`;
  if (minutes < 60) return `${inPrefix}${minutes}m${suffix}`;
  if (hours < 24) return `${inPrefix}${hours}h${suffix}`;
  return `${inPrefix}${days}d${suffix}`;
}
