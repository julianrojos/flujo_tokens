/**
 * AI Prompt Policy
 * Loads editorial style guidelines from .agents/rules/*.mdc files
 * and injects them into LLM prompts for consistent tone and terminology.
 *
 * Additive-only: if loading fails, the orchestrator continues with the base prompt.
 */

import fs from 'fs/promises';
import path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SectionConfig {
    heading: string;
    priority: number;
}

export interface PolicyFileConfig {
    relativePath: string;
    sections: SectionConfig[];
}

export interface ExtractedSection {
    heading: string;
    source: string;
    priority: number;
    text: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MAX_POLICY_CHARS = 3000;

export const POLICY_FILES: PolicyFileConfig[] = [
    {
        relativePath: '.agents/rules/docs-language-tone.mdc',
        sections: [
            { heading: 'Tone policy', priority: 1 },
            { heading: 'Tone violation examples', priority: 2 },
            { heading: 'Writing style', priority: 3 },
            { heading: 'Capitalisation rules', priority: 4 },
        ],
    },
    {
        relativePath: '.agents/rules/inclusive-docs.mdc',
        sections: [
            { heading: 'Accessibility', priority: 5 },
        ],
    },
];

// ---------------------------------------------------------------------------
// Module-level cache
// ---------------------------------------------------------------------------

const _cachedPolicyContextByRoot = new Map<string, string>();
const _warnedKeys = new Set<string>();

// ---------------------------------------------------------------------------
// Pure parser
// ---------------------------------------------------------------------------

/**
 * Extract the content under a specific H2 heading from raw .mdc content.
 * Case-insensitive match on the heading text (after ##).
 * Returns content from the heading until the next ## or EOF.
 * Pure function — no I/O, never throws.
 */
export function parseMdcSection(rawContent: string, heading: string): string | null {
    // Strip BOM + normalize CRLF
    const normalised = rawContent
        .replace(/^\uFEFF/, '')
        .replace(/\r\n/g, '\n');
    const trimmedStart = normalised.trimStart();

    // Strip YAML frontmatter only when it appears at the beginning of the file.
    // This avoids accidentally truncating content that contains '---' later.
    const body = trimmedStart.startsWith('---\n')
        ? trimmedStart.replace(/^---\n[\s\S]*?\n---\n?/, '')
        : normalised;
    const headingRegex = /^## (.+)$/gm;
    let match: RegExpExecArray | null;

    while ((match = headingRegex.exec(body)) !== null) {
        const matchedHeading = match[1].trim();
        if (matchedHeading.toLowerCase() === heading.toLowerCase()) {
            const sectionStart = match.index + match[0].length;
            // Find next H2 or EOF
            headingRegex.lastIndex = sectionStart;
            const nextMatch = headingRegex.exec(body);
            const sectionEnd = nextMatch ? nextMatch.index : body.length;
            return body.slice(sectionStart, sectionEnd).trim();
        }
    }

    return null;
}

// ---------------------------------------------------------------------------
// I/O layer
// ---------------------------------------------------------------------------

function warnOnce(key: string, message: string): void {
    if (_warnedKeys.has(key)) return;
    _warnedKeys.add(key);
    console.warn(`[ai-prompt-policy] ${message}`);
}

/**
 * Load selected sections from a single .mdc file.
 * Returns ExtractedSection[] for sections that were found.
 * Never throws — warns on failure and returns [].
 */
async function loadMdcSections(
    absolutePath: string,
    sections: SectionConfig[],
    sourceLabel: string,
): Promise<ExtractedSection[]> {
    let rawContent: string;
    try {
        rawContent = await fs.readFile(absolutePath, 'utf-8');
    } catch (err) {
        warnOnce(
            `file-not-found:${absolutePath}`,
            `Cannot read ${sourceLabel} at ${absolutePath}: ${err instanceof Error ? err.message : String(err)}. Policy context will be omitted.`,
        );
        return [];
    }

    const results: ExtractedSection[] = [];
    for (const section of sections) {
        const text = parseMdcSection(rawContent, section.heading);
        if (text === null) {
            warnOnce(
                `heading-not-found:${sourceLabel}:${section.heading}`,
                `Heading "${section.heading}" not found in ${sourceLabel}. Skipping.`,
            );
            continue;
        }
        results.push({
            heading: section.heading,
            source: sourceLabel,
            priority: section.priority,
            text,
        });
    }
    return results;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the combined policy context string from all configured .mdc files.
 * Result is cached at module level after the first successful call.
 * Never throws — returns '' on failure.
 *
 * @param repoRoot - Absolute path to the repository root
 * @returns Combined policy context string, or '' if unavailable
 */
export async function buildPromptPolicyContext(repoRoot: string): Promise<string> {
    const normalizedRoot = path.resolve(repoRoot);
    const cached = _cachedPolicyContextByRoot.get(normalizedRoot);
    if (cached !== undefined) {
        return cached;
    }

    try {
        const loadPromises = POLICY_FILES.map(async (fileConfig) => {
            const absolutePath = path.join(repoRoot, fileConfig.relativePath);
            const fileName = path.basename(fileConfig.relativePath, '.mdc');
            return loadMdcSections(absolutePath, fileConfig.sections, fileName);
        });

        const results = await Promise.all(loadPromises);
        const allSections = results.flat();

        // Sort by priority (ascending = highest priority first)
        allSections.sort((a, b) => a.priority - b.priority);

        // Greedy assembly within budget
        const parts: string[] = [];
        let totalLength = 0;

        for (const section of allSections) {
            const marked = `[source: ${section.source} > ${section.heading}]\n${section.text}`;
            const separator = parts.length > 0 ? '\n\n' : '';
            if (totalLength + separator.length + marked.length <= MAX_POLICY_CHARS) {
                parts.push(`${separator}${marked}`);
                totalLength += separator.length + marked.length;
            } else {
                warnOnce(
                    `truncation:${section.source}:${section.heading}`,
                    `Excluding section "${section.heading}" from ${section.source} (would exceed ${MAX_POLICY_CHARS} char budget).`,
                );
            }
        }

        const result = parts.join('');
        if (result.length > 0) {
            _cachedPolicyContextByRoot.set(normalizedRoot, result);
        }
        return result;
    } catch (err) {
        warnOnce(
            `build-context-error`,
            `Failed to build policy context: ${err instanceof Error ? err.message : String(err)}. Continuing with empty context.`,
        );
        return '';
    }
}

/**
 * Reset the module-level cache and warn tracking.
 * Exported exclusively for use in tests.
 */
export function resetPromptPolicyCacheForTests(): void {
    _cachedPolicyContextByRoot.clear();
    _warnedKeys.clear();
}
