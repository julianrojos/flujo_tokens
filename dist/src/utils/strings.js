/**
 * String manipulation helpers.
 */
import { kebabCaseCache } from '../runtime/state.js';
import { STARTS_WITH_DIGIT_REGEX, CSS_VAR_NAME_AFTER_DASHES_REGEX } from './regex.js';
export function toKebabCase(name) {
    const cached = kebabCaseCache.get(name);
    if (cached !== undefined) {
        return cached;
    }
    // Convert common separators and camelCase into kebab-case (used in CSS identifiers).
    let result = name.replace(/-/g, ' ');
    result = result.replace(/[\\/]+/g, ' ');
    result = result.replace(/([a-z])([A-Z])/g, '$1-$2');
    result = result.toLowerCase();
    result = result.replace(/[\s-]+/g, '-');
    result = result.replace(/^-+|-+$/g, '');
    kebabCaseCache.set(name, result);
    return result;
}
export function isValidCssVariableName(name) {
    if (!name.startsWith('--'))
        return false;
    const afterDashes = name.slice(2);
    // Custom properties cannot start with a digit immediately after the dashes.
    if (!afterDashes || STARTS_WITH_DIGIT_REGEX.test(afterDashes))
        return false;
    return CSS_VAR_NAME_AFTER_DASHES_REGEX.test(afterDashes);
}
/**
 * Builds a CSS custom property name from a kebab-cased prefix:
 *   ["colors", "brand", "primary"] → "--colors-brand-primary"
 *
 * If all segments are empty, this returns `"--"`. Call sites validate the name and omit invalid
 * declarations while reporting diagnostics.
 */
export function buildCssVarNameFromPrefix(prefix) {
    let out = '--';
    let first = true;
    for (let i = 0; i < prefix.length; i++) {
        const p = prefix[i];
        if (!p)
            continue;
        if (!first)
            out += '-';
        out += p;
        first = false;
    }
    return out;
}
export function toSafePlaceholderName(id) {
    const placeholderName = id
        .replace(/[^a-zA-Z0-9]/g, '-')
        .toLowerCase()
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
    return placeholderName || 'unknown';
}
/**
 * Escapes a raw string into a valid CSS double-quoted string literal.
 * The output is kept single-line because this script emits single-line declarations.
 */
export function quoteCssStringLiteral(value) {
    const escaped = value
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\r\n|\r|\n/g, ' ');
    return `"${escaped}"`;
}
