/**
 * CSS parsing and formatting utilities.
 */

import fs from 'fs';
import { isValidCssVariableName } from '../utils/strings.js';

/**
 * Extracts `--name: value;` declarations from the whole stylesheet.
 *
 * This uses a small scanner instead of a regex so it can ignore semicolons inside:
 * - quoted strings
 * - parentheses (e.g., `calc(...)`, `url(...)`)
 */
export function extractCssVariables(cssContent: string): Map<string, string> {
    const variables = new Map<string, string>();
    // Strip comments to simplify scanning.
    const content = cssContent.replace(/\/\*[\s\S]*?\*\//g, '');

    const isEscaped = (pos: number): boolean => {
        let backslashes = 0;
        let idx = pos - 1;
        while (idx >= 0 && content[idx] === '\\') {
            backslashes++;
            idx--;
        }
        return backslashes % 2 === 1;
    };

    let i = 0;
    while (i < content.length) {
        while (i < content.length && /\s/.test(content[i])) i++;

        if (i >= content.length || content.substring(i, i + 2) !== '--') {
            i++;
            continue;
        }

        const nameStart = i + 2;
        let nameEnd = nameStart;
        while (nameEnd < content.length && /[a-zA-Z0-9_-]/.test(content[nameEnd])) {
            nameEnd++;
        }
        const name = content.substring(nameStart, nameEnd);

        i = nameEnd;
        while (i < content.length && /\s/.test(content[i])) i++;
        if (i >= content.length || content[i] !== ':') continue;
        i++;

        while (i < content.length && /\s/.test(content[i])) i++;

        const valueStart = i;
        let depth = 0;
        let inString = false;
        let stringChar = '';

        while (i < content.length) {
            const char = content[i];
            if ((char === '"' || char === "'") && !isEscaped(i)) {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                } else if (char === stringChar) {
                    inString = false;
                }
            }

            if (!inString) {
                if (char === '(') depth++;
                else if (char === ')') depth--;
                else if (char === ';' && depth === 0) break;
            }

            i++;
        }

        const valueParsed = content.substring(valueStart, i).trim();
        const valueIsSane = valueParsed.length > 0 && !/[\r\n\x00-\x1F]/.test(valueParsed);
        if (name && valueIsSane && isValidCssVariableName(`--${name}`)) {
            variables.set(name, valueParsed);
        }

        i++;
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
