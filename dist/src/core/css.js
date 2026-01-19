/**
 * CSS parsing and formatting utilities.
 */
import fs from 'fs';
import { isValidCssVariableName } from '../utils/strings.js';
/**
 * Extracts `--name: value;` declarations from a `:root { ... }` block.
 *
 * This uses a small scanner instead of a regex so it can ignore semicolons inside:
 * - quoted strings
 * - parentheses (e.g., `calc(...)`, `url(...)`)
 */
export function extractCssVariables(cssContent) {
    const variables = new Map();
    const rootStart = cssContent.indexOf(':root');
    if (rootStart === -1)
        return variables;
    const braceStart = cssContent.indexOf('{', rootStart);
    if (braceStart === -1)
        return variables;
    // Best-effort brace matching for the :root block.
    let braceCount = 0;
    let braceEnd = braceStart;
    for (let i = braceStart; i < cssContent.length; i++) {
        if (cssContent[i] === '{')
            braceCount++;
        else if (cssContent[i] === '}') {
            braceCount--;
            if (braceCount === 0) {
                braceEnd = i;
                break;
            }
        }
    }
    let rootContent;
    if (braceCount !== 0) {
        const rootMatch = cssContent.match(/:root\s*\{([\s\S]+?)\}/);
        if (!rootMatch)
            return variables;
        rootContent = rootMatch[1];
    }
    else {
        rootContent = cssContent.substring(braceStart + 1, braceEnd);
    }
    // Strip comments within :root to simplify scanning.
    rootContent = rootContent.replace(/\/\*[\s\S]*?\*\//g, '');
    const isEscaped = (pos) => {
        let backslashes = 0;
        let idx = pos - 1;
        while (idx >= 0 && rootContent[idx] === '\\') {
            backslashes++;
            idx--;
        }
        return backslashes % 2 === 1;
    };
    let i = 0;
    while (i < rootContent.length) {
        while (i < rootContent.length && /\s/.test(rootContent[i]))
            i++;
        if (i >= rootContent.length || rootContent.substring(i, i + 2) !== '--') {
            i++;
            continue;
        }
        const nameStart = i + 2;
        let nameEnd = nameStart;
        while (nameEnd < rootContent.length && /[a-zA-Z0-9_-]/.test(rootContent[nameEnd])) {
            nameEnd++;
        }
        const name = rootContent.substring(nameStart, nameEnd);
        i = nameEnd;
        while (i < rootContent.length && /\s/.test(rootContent[i]))
            i++;
        if (i >= rootContent.length || rootContent[i] !== ':')
            continue;
        i++;
        while (i < rootContent.length && /\s/.test(rootContent[i]))
            i++;
        const valueStart = i;
        let depth = 0;
        let inString = false;
        let stringChar = '';
        while (i < rootContent.length) {
            const char = rootContent[i];
            if ((char === '"' || char === "'") && !isEscaped(i)) {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                }
                else if (char === stringChar) {
                    inString = false;
                }
            }
            if (!inString) {
                if (char === '(')
                    depth++;
                else if (char === ')')
                    depth--;
                else if (char === ';' && depth === 0)
                    break;
            }
            i++;
        }
        const valueParsed = rootContent.substring(valueStart, i).trim();
        const valueIsSane = valueParsed.length > 0 && !/[\r\n\x00-\x1F]/.test(valueParsed);
        if (name && valueIsSane && isValidCssVariableName(`--${name}`)) {
            variables.set(name, valueParsed);
        }
        i++;
    }
    return variables;
}
export function readCssVariablesFromFile(filePath) {
    const previousCss = fs.readFileSync(filePath, 'utf-8');
    return extractCssVariables(previousCss);
}
/**
 * Formats a CSS section header comment.
 */
export function formatCssSectionHeader(name) {
    return `\n  /* ========== ${name} ========== */\n`;
}
