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

    const countChar = (line: string, char: string): number => {
        let count = 0;
        for (const c of line) {
            if (c === char) count++;
        }
        return count;
    };

    let currentScope: string | null = null;
    let scopeDepth = 0;

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        if (currentScope === null) {
            const openBraceIndex = line.indexOf('{');
            if (openBraceIndex >= 0) {
                const selector = line.slice(0, openBraceIndex).trim();
                if (selector.length > 0) {
                    currentScope = selector;
                    scopeDepth = 0;
                }
            }
        }

        if (currentScope === null) continue;

        const match = CSS_DECL_LINE_REGEX.exec(rawLine);
        if (match && match[1] && match[2] !== undefined) {
            const name = match[1];
            const value = match[2].trim();
            const valueIsSane = value.length > 0 && !/[\r\n\x00-\x1F]/.test(value);
            if (valueIsSane && isValidCssVariableName(`--${name}`)) {
                variables.set(`${currentScope}::${name}`, value);
            }
        }

        scopeDepth += countChar(rawLine, '{');
        scopeDepth -= countChar(rawLine, '}');
        if (scopeDepth <= 0) {
            currentScope = null;
            scopeDepth = 0;
        }
    }

    return variables;
}

export function readCssVariablesFromFile(filePath: string): Map<string, string> {
    const previousCss = fs.readFileSync(filePath, 'utf-8');
    return extractCssVariables(previousCss);
}

/**
 * Formats a CSS section header comment.
 */
export function formatCssSectionHeader(name: string): string {
    return `\n  /* = ${name} = */\n`;
}
