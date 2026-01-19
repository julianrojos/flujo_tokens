/**
 * Token and context types for the CSS variables generator.
 */
// --- Type guards ---
export function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function isVariableAlias(value) {
    return isPlainObject(value) && value.type === 'VARIABLE_ALIAS';
}
/**
 * Detects keys representing mode branches (e.g., `modeDefault`, `modeDark`, `mode_1`).
 * This is intentionally conservative to avoid false positives such as "model" / "modeled".
 */
export function isModeKey(key) {
    if (!key)
        return false;
    if (!/^mode/i.test(key))
        return false;
    const tail = key.slice(4);
    if (!tail)
        return true;
    if (tail.toLowerCase() === 'default')
        return true;
    const first = tail[0];
    return /[A-Z0-9_-]/.test(first);
}
export function shouldSkipKey(key) {
    // Skip metadata ($...) and mode branches; the selected mode branch is traversed separately.
    return key.startsWith('$') || isModeKey(key);
}
