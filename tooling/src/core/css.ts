/**
 * CSS parsing and formatting utilities.
 */

import fs from 'fs';
import { CSS_DECL_LINE_REGEX } from '../utils/regex.js';
import { isValidCssVariableName } from '../utils/strings.js';

/**
 * Extracts CSS variable declarations as scope-aware keys:
 * `scope::name` -> `value`.
 *
 * Example keys:
 * - `:root::color-text`
 * - `[data-theme="dark"]::color-text`
 */
export function extractCssVariables(cssContent: string): Map<string, string> {
    const variables = new Map<string, string>();
    const content = cssContent.replace(/\/\*[\s\S]*?\*\//g, '');
    const lines = content.split(/\r?\n/);

    const scopeStack: string[] = [];

    const resolveScope = (): string | null => {
        if (scopeStack.length === 0) return null;
        for (let i = scopeStack.length - 1; i >= 0; i -= 1) {
            const scope = scopeStack[i];
            if (!scope.trim().startsWith('@')) return scope;
        }
        return scopeStack[scopeStack.length - 1] || null;
    };

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        // Track scope transitions left-to-right to support nested selectors on one line.
        let cursor = 0;
        while (cursor < rawLine.length) {
            const openBrace = rawLine.indexOf('{', cursor);
            const closeBrace = rawLine.indexOf('}', cursor);

            if (closeBrace >= 0 && (openBrace < 0 || closeBrace < openBrace)) {
                if (scopeStack.length > 0) scopeStack.pop();
                cursor = closeBrace + 1;
                continue;
            }

            if (openBrace >= 0 && (closeBrace < 0 || openBrace < closeBrace)) {
                const selector = rawLine.slice(cursor, openBrace).trim();
                if (selector.length > 0) {
                    scopeStack.push(selector);
                }
                cursor = openBrace + 1;
                continue;
            }

            break;
        }

        const currentScope = resolveScope();
        if (!currentScope) continue;

        const match = CSS_DECL_LINE_REGEX.exec(rawLine);
        if (!match || !match[1] || match[2] === undefined) continue;

        const name = match[1];
        const value = match[2].trim();
        const valueIsSane = value.length > 0 && !/[\r\n\x00-\x1F]/.test(value);
        if (valueIsSane && isValidCssVariableName(`--${name}`)) {
            variables.set(`${currentScope}::${name}`, value);
        }
    }

    return variables;
}

export function readCssVariablesFromFile(filePath: string): Map<string, string> {
    try {
        const previousCss = fs.readFileSync(filePath, 'utf-8');
        return extractCssVariables(previousCss);
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to read CSS variables from "${filePath}": ${detail}`);
    }
}

/**
 * Formats a CSS section header comment.
 */
export function formatCssSectionHeader(name: string): string {
    return `\n  /* = ${name} = */\n`;
}
