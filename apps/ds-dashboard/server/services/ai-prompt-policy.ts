/**
 * AI Prompt Policy
 * Loads editorial style guidelines and skill rules from ai-context
 * and injects stage-specific context into LLM prompts for consistent tone,
 * terminology, and quality across the 3-stage AI pipeline.
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

export type PolicyCallStage = 'extraction' | 'editorial' | 'validation';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Budget per stage — extraction needs more space for rules */
export const MAX_POLICY_CHARS_BY_STAGE: Record<PolicyCallStage, number> = {
    extraction: 8000,
    editorial: 10000,
    validation: 3000,
};

/** Legacy constant for backwards compatibility with existing callers */
export const MAX_POLICY_CHARS = 3000;

/**
 * Stage-specific file configs.
 * Each stage loads sections from SKILL.md files + RULES.md.
 * Headings match the H2 sections in those files (case-insensitive).
 * Priority values are intentionally non-sequential in some stages:
 * gaps keep ordering stable when sections are removed/added without renumber churn.
 */
export const POLICY_FILES_BY_STAGE: Record<PolicyCallStage, PolicyFileConfig[]> = {
    extraction: [
        {
            relativePath: 'apps/ds-dashboard/ai-context/skills/figma-component-extractor.SKILL.md',
            sections: [
                { heading: 'Regla madre', priority: 1 },
                { heading: 'Reglas de extracción', priority: 2 },
                { heading: 'Qué esta llamada NO debe hacer', priority: 3 },
            ],
        },
        {
            relativePath: 'apps/ds-dashboard/ai-context/rules/RULES.md',
            sections: [
                { heading: '2. Honestidad antes que completitud', priority: 4 },
                { heading: '4. Estado visual ≠ comportamiento real', priority: 5 },
                { heading: '5. Accesibilidad con niveles de confianza', priority: 6 },
                { heading: '7. StructureWarning', priority: 7 },
                { heading: '9. Placeholders obligatorios', priority: 8 },
            ],
        },
        {
            relativePath: 'apps/ds-dashboard/ai-context/skills/variant-state-classifier.SKILL.md',
            sections: [
                { heading: 'Regla central', priority: 9 },
                { heading: 'Qué NO debe hacer', priority: 10 },
            ],
        },
    ],
    editorial: [
        {
            relativePath: 'apps/ds-dashboard/ai-context/skills/editorial-patch-writer.SKILL.md',
            sections: [
                { heading: 'Regla de oro', priority: 1 },
                { heading: 'Reglas editoriales', priority: 2 },
                { heading: 'Qué NO debe hacer', priority: 3 },
            ],
        },
        {
            // Core rules first — must survive even at reduced budget
            relativePath: 'apps/ds-dashboard/ai-context/rules/RULES.md',
            sections: [
                { heading: '1. Regla madre', priority: 4 },
                { heading: '9. Placeholders obligatorios', priority: 5 },
                { heading: '8. Coherencia terminológica', priority: 6 },
                { heading: '10. QA específico', priority: 9 },
            ],
        },
        {
            relativePath: 'apps/ds-dashboard/ai-context/rules/docs-language-tone.mdc',
            sections: [
                { heading: 'Tone policy', priority: 7 },
                { heading: 'Writing style', priority: 8 },
                { heading: 'Tone violation examples', priority: 10 },
            ],
        },
        {
            relativePath: 'apps/ds-dashboard/ai-context/rules/inclusive-docs.mdc',
            sections: [
                { heading: 'Prohibited claims', priority: 11 },
            ],
        },
    ],
    validation: [
        {
            relativePath: 'apps/ds-dashboard/ai-context/skills/doc-consistency-checker.SKILL.md',
            sections: [
                { heading: 'Qué valida', priority: 1 },
                { heading: 'Severidad recomendada', priority: 2 },
                { heading: 'Regla final', priority: 3 },
            ],
        },
        {
            relativePath: 'apps/ds-dashboard/ai-context/rules/RULES.md',
            sections: [
                { heading: '12. Regla de publicación', priority: 4 },
                { heading: '11. Severidad de validación', priority: 5 },
                { heading: '9. Placeholders obligatorios', priority: 6 },
            ],
        },
        {
            relativePath: 'apps/ds-dashboard/ai-context/rules/inclusive-docs.mdc',
            sections: [
                { heading: 'Prohibited claims', priority: 7 },
            ],
        },
    ],
};

// ---------------------------------------------------------------------------
// Module-level cache
// ---------------------------------------------------------------------------

const _cachedPolicyContextByKey = new Map<string, string>();
const _warnedKeys = new Set<string>();

// ---------------------------------------------------------------------------
// Pure parser
// ---------------------------------------------------------------------------

/**
 * Extract the content under a specific H2 heading from raw markdown content.
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
 * Load selected sections from a single markdown file.
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
 * Build the combined policy context string for a specific pipeline stage.
 * Result is cached at module level (keyed by repoRoot + callStage).
 * Never throws — returns '' on failure.
 *
 * @param repoRoot - Absolute path to the repository root
 * @param callStage - Which pipeline stage is requesting context
 * @returns Combined policy context string, or '' if unavailable
 */
export async function buildPromptPolicyContext(
    repoRoot: string,
    callStage: PolicyCallStage = 'extraction',
): Promise<string> {
    const cacheKey = `${path.resolve(repoRoot)}:${callStage}`;
    const cached = _cachedPolicyContextByKey.get(cacheKey);
    if (cached !== undefined) {
        return cached;
    }

    const budget = MAX_POLICY_CHARS_BY_STAGE[callStage];
    const stageFiles = POLICY_FILES_BY_STAGE[callStage];

    try {
        const loadPromises = stageFiles.map(async (fileConfig) => {
            const absolutePath = path.join(repoRoot, fileConfig.relativePath);
            const fileName = path.basename(fileConfig.relativePath);
            return loadMdcSections(absolutePath, fileConfig.sections, fileName);
        });

        const results = await Promise.all(loadPromises);
        const allSections = results.flat();
        if (allSections.length === 0) {
            warnOnce(
                `no-sections:${callStage}:${cacheKey}`,
                `No sections loaded for ${callStage} stage. Check POLICY_FILES_BY_STAGE paths and headings.`,
            );
        }

        // Sort by priority (ascending = highest priority first)
        allSections.sort((a, b) => a.priority - b.priority);

        // Greedy assembly within budget
        const parts: string[] = [];
        let totalLength = 0;

        for (const section of allSections) {
            const marked = `[source: ${section.source} > ${section.heading}]\n${section.text}`;
            const separator = parts.length > 0 ? '\n\n' : '';
            if (totalLength + separator.length + marked.length <= budget) {
                parts.push(`${separator}${marked}`);
                totalLength += separator.length + marked.length;
            } else {
                warnOnce(
                    `truncation:${callStage}:${section.source}:${section.heading}`,
                    `Excluding section "${section.heading}" from ${section.source} (${callStage} stage, would exceed ${budget} char budget).`,
                );
            }
        }

        const result = parts.join('');
        if (result.length > 0) {
            _cachedPolicyContextByKey.set(cacheKey, result);
        }
        return result;
    } catch (err) {
        warnOnce(
            `build-context-error:${callStage}`,
            `Failed to build policy context for ${callStage}: ${err instanceof Error ? err.message : String(err)}. Continuing with empty context.`,
        );
        return '';
    }
}

/**
 * Reset the module-level cache and warn tracking.
 * Exported exclusively for use in tests.
 */
export function resetPromptPolicyCacheForTests(): void {
    _cachedPolicyContextByKey.clear();
    _warnedKeys.clear();
}
