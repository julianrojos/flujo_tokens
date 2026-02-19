/**
 * String manipulation helpers.
 */

import { kebabCaseCache } from '../runtime/state.js';
import { STARTS_WITH_DIGIT_REGEX, CSS_VAR_NAME_AFTER_DASHES_REGEX } from './regex.js';

export function toKebabCase(name: string): string {
    const cached = kebabCaseCache.get(name);
    if (cached !== undefined) {
        return cached;
    }

    const raw = name.trim();
    // Preserve numeric negative keys (e.g. "-16", "-0.5") so sign is kept in CSS var segments.
    // Decimal separator is normalized to "-" to keep a valid CSS custom property segment.
    if (/^-\d+(?:\.\d+)?$/.test(raw)) {
        const numericNegative = raw.replace(/\./g, '-');
        kebabCaseCache.set(name, numericNegative);
        return numericNegative;
    }

    // Convert camelCase and whitespace/slashes into kebab-style without altering existing hyphens/underscores.
    let result = raw.replace(/[\\/]+/g, '-'); // normalize path separators to dashes
    result = result.replace(/([a-z])([A-Z])/g, '$1-$2'); // split camelCase
    result = result.replace(/\s+/g, '-'); // collapse spaces to dashes
    result = result.replace(/\.+/g, '-'); // dots are not valid in CSS var names
    result = result.toLowerCase();
    result = result.replace(/^-+|-+$/g, ''); // trim outer dashes, keep internal hyphens/underscores intact

    kebabCaseCache.set(name, result);
    return result;
}

export function isValidCssVariableName(name: string): boolean {
    if (!name.startsWith('--')) return false;
    const afterDashes = name.slice(2);
    // Custom properties cannot start with a digit immediately after the dashes.
    if (!afterDashes || STARTS_WITH_DIGIT_REGEX.test(afterDashes)) return false;
    return CSS_VAR_NAME_AFTER_DASHES_REGEX.test(afterDashes);
}

/**
 * Builds a CSS custom property name from a kebab-cased prefix:
 *   ["colors", "brand", "primary"] → "--colors-brand-primary"
 *
 * If all segments are empty, this returns `"--"`. Call sites validate the name and omit invalid
 * declarations while reporting diagnostics.
 */
export function buildCssVarNameFromPrefix(prefix: string[]): string {
    let out = '--';
    let first = true;

    for (let i = 0; i < prefix.length; i++) {
        const p = prefix[i];
        if (!p) continue;
        if (!first) out += '-';
        out += p;
        first = false;
    }

    return out;
}

export function toSafePlaceholderName(id: string): string {
    const placeholderName = id
        .replace(/[^a-zA-Z0-9]/g, '-')
        .toLowerCase()
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
    return placeholderName || 'unknown';
}
