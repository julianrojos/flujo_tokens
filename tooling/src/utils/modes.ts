/**
 * Shared mode normalization/matching helpers.
 */

import { toKebabCase } from './strings.js';

export function normalizeModeName(modeKey: string | undefined): string {
    if (!modeKey) return '';
    const trimmed = modeKey.trim();
    return trimmed ? toKebabCase(trimmed) : '';
}

export function normalizePreferredMode(preferredMode?: string): string | undefined {
    const trimmed = preferredMode?.trim().toLowerCase();
    if (!trimmed) return undefined;

    // Drop leading non-alphanumerics and the common "mode" prefix to align with export keys.
    let cleaned = trimmed.replace(/^[^a-z0-9]+/i, '');
    if (cleaned.startsWith('mode')) {
        cleaned = cleaned.slice(4).replace(/^[^a-z0-9]+/i, '') || cleaned;
    }

    const normalized = cleaned.replace(/[^a-z0-9]+/g, '');
    return normalized || undefined;
}

export function matchesPreferredMode(modeKey: string, preferred?: string): boolean {
    const normalizedPreferred = normalizePreferredMode(preferred);
    if (!normalizedPreferred) return false;
    const normalizedMode = normalizeModeName(modeKey).replace(/^mode[-_]?/i, '').replace(/[^a-z0-9]+/gi, '').toLowerCase();
    return normalizedMode === normalizedPreferred;
}

export function formatModeLabel(modeKey: string | undefined): string {
    const normalized = normalizeModeName(modeKey);
    const withoutPrefix = normalized.replace(/^mode[-_]?/i, '');
    const label = withoutPrefix || normalized || (modeKey ?? '');
    return label.toUpperCase();
}
