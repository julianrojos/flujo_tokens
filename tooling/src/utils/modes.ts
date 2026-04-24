/**
 * Shared mode normalization/matching helpers.
 */

import { toKebabCase } from './strings.js';

function normalizeModeComparisonKey(value: string): string {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/^[^a-z0-9]+/i, '')
        .replace(/^mode[-_]*/i, '')
        .replace(/[^a-z0-9]+/g, '')
        .toLowerCase();
}

export function normalizeModeName(modeKey: string | undefined): string {
    if (!modeKey) return '';
    const trimmed = modeKey.trim();
    return trimmed ? toKebabCase(trimmed) : '';
}

export function normalizePreferredMode(preferredMode?: string): string | undefined {
    const trimmed = preferredMode?.trim().toLowerCase();
    if (!trimmed) return undefined;
    const normalized = normalizeModeComparisonKey(trimmed);
    return normalized || undefined;
}

export function matchesPreferredMode(modeKey: string, preferred?: string): boolean {
    const normalizedPreferred = normalizePreferredMode(preferred);
    if (!normalizedPreferred) return false;
    const normalizedMode = normalizeModeComparisonKey(normalizeModeName(modeKey));
    return normalizedMode === normalizedPreferred;
}

export function formatModeLabel(modeKey: string | undefined): string {
    const normalized = normalizeModeName(modeKey);
    const withoutPrefix = normalized.replace(/^mode[-_]?/i, '');
    const label = withoutPrefix || normalized || (modeKey ?? '');
    return label.toUpperCase();
}
