/**
 * Component Documentation Renderer
 * Converts ComponentDocOutput into markdown following project conventions
 */

import type { ComponentDocOutput } from './ai-component-doc-schema.js';
import type { EditorialPatch } from './ai-editorial-patch-schema.js';

export interface RenderComponentDocOptions {
    /** Factual output from LLM extraction */
    output: ComponentDocOutput;
    /** Optional editorial patch for enriched preview (does NOT affect apply) */
    editorialPatch?: EditorialPatch | null;
}

/**
 * Render ComponentDocOutput to markdown.
 * When editorialPatch is provided, appends editorial sections for preview.
 * Without editorialPatch (or null), renders base factual markdown only.
 *
 * @param options - Render options (or ComponentDocOutput for backwards compat)
 * @returns Markdown string
 */
export function renderComponentDoc(
    input: RenderComponentDocOptions | ComponentDocOutput,
): string {
    const output: ComponentDocOutput = 'output' in input ? input.output : input;
    const editorialPatch: EditorialPatch | null | undefined = 'output' in input ? input.editorialPatch : null;

    const lines: string[] = [];

    // Frontmatter
    lines.push('---');
    lines.push(`doc_type: component`);
    lines.push(`doc_status: ai-draft`);
    lines.push(`figma.component_set_node_id: ${output.componentId}`);
    lines.push(`ai.schema_version: ${output.schemaVersion}`);
    lines.push(`ai.generated_at: ${output.metadata?.generatedAt || new Date().toISOString()}`);
    if (output.metadata?.provider) {
        lines.push(`ai.provider: ${output.metadata.provider}`);
    }
    if (output.metadata?.model) {
        lines.push(`ai.model: ${output.metadata.model}`);
    }
    lines.push('---');
    lines.push('');

    // Title
    lines.push(`# ${escapeMarkdown(output.title)}`);
    lines.push('');

    // Summary
    lines.push(output.summary);
    lines.push('');

    // Anatomy section
    lines.push('## Anatomy');
    lines.push('');
    if (output.anatomy.length === 0) {
        lines.push('None documented.');
    } else {
        lines.push('| Name | Type | Description | Optional |');
        lines.push('|------|------|-------------|----------|');
        for (const item of output.anatomy) {
            lines.push(
                `| ${escapeMarkdownTableCell(item.name)} | ${item.type} | ${escapeMarkdownTableCell(item.description)} | ${item.optional ? 'Yes' : 'No'} |`
            );
            // Render children if present
            if (item.children && item.children.length > 0) {
                for (const child of item.children) {
                    lines.push(
                        `| ↳ ${escapeMarkdownTableCell(child.name)} | ${child.type} | ${escapeMarkdownTableCell(child.description)} | ${child.optional ? 'Yes' : 'No'} |`
                    );
                }
            }
        }
    }
    lines.push('');

    // Variants section
    lines.push('## Variants');
    lines.push('');
    if (output.variants.length === 0) {
        lines.push('None documented.');
    } else {
        lines.push('| Name | Description | Properties |');
        lines.push('|------|-------------|------------|');
        for (const variant of output.variants) {
            const propsStr = Object.entries(variant.properties)
                .map(([k, v]) => `${k}: ${v}`)
                .join(', ');
            lines.push(
                `| ${escapeMarkdownTableCell(variant.name)} | ${escapeMarkdownTableCell(variant.description)} | ${propsStr} |`
            );
        }
    }
    lines.push('');

    // Design Tokens section
    lines.push('## Design Tokens');
    lines.push('');
    if (output.tokens.length === 0) {
        lines.push('None documented.');
    } else {
        lines.push('| Name | Value | Type | Description |');
        lines.push('|------|-------|------|-------------|');
        for (const token of output.tokens) {
            const unresolvedVariableId = /^VariableID:/i.test(token.name)
                || /^VariableID:/i.test(String(token.value));
            const description = token.description?.trim()
                || (unresolvedVariableId
                    ? '[Por confirmar con dev] Token reference unresolved from Figma variable id.'
                    : '-');
            lines.push(
                `| ${escapeMarkdownTableCell(token.name)} | \`${token.value}\` | ${token.type} | ${escapeMarkdownTableCell(description)} |`
            );
        }
    }
    lines.push('');

    // Accessibility section
    lines.push('## Accessibility');
    lines.push('');
    if (output.accessibilityNotes.length > 0) {
        for (const note of output.accessibilityNotes) {
            lines.push(`- ${escapeMarkdown(note)}`);
        }
    } else if (Array.isArray(output.accessibilityFacts) && output.accessibilityFacts.length > 0) {
        for (const fact of output.accessibilityFacts) {
            lines.push(`- ${escapeMarkdown(fact.fact)} (${escapeMarkdown(fact.source)})`);
        }
    } else {
        lines.push('TBD (pending accessibility validation).');
    }

    // --- Editorial sections (preview only) ---
    if (editorialPatch) {
        lines.push('');

        // Purpose & Usage
        const summary = editorialPatch.summary;
        if (summary && (summary.purpose || summary.when_to_use || summary.when_not_to_use)) {
            lines.push('## Editorial: Purpose & Usage');
            lines.push('');
            if (summary.purpose) {
                lines.push(`**Purpose:** ${escapeMarkdown(summary.purpose)}`);
                lines.push('');
            }
            if (summary.when_to_use) {
                lines.push(`**When to use:** ${escapeMarkdown(summary.when_to_use)}`);
                lines.push('');
            }
            if (summary.when_not_to_use) {
                lines.push(`**When not to use:** ${escapeMarkdown(summary.when_not_to_use)}`);
                lines.push('');
            }
        }

        // Best Practices (Do/Don't)
        const bestPractices = editorialPatch.best_practices;
        if (bestPractices && (bestPractices.do?.length || bestPractices.dont?.length)) {
            lines.push('## Editorial: Best Practices');
            lines.push('');
            if (bestPractices.do?.length) {
                lines.push('### Do');
                lines.push('');
                for (const item of bestPractices.do) {
                    lines.push(`- ${escapeMarkdown(item)}`);
                }
                lines.push('');
            }
            if (bestPractices.dont?.length) {
                lines.push('### Don\'t');
                lines.push('');
                for (const item of bestPractices.dont) {
                    lines.push(`- ${escapeMarkdown(item)}`);
                }
                lines.push('');
            }
        }

        // Related Components
        const related = editorialPatch.related_components;
        if (related && related.length > 0) {
            lines.push('## Editorial: Related Components');
            lines.push('');
            for (const comp of related) {
                lines.push(`- ${escapeMarkdown(comp)}`);
            }
            lines.push('');
        }

        // QA Checklist
        const qa = editorialPatch.qa;
        if (qa && qa.length > 0) {
            lines.push('## Editorial: QA Checklist');
            lines.push('');
            for (const item of qa) {
                lines.push(`- [ ] ${escapeMarkdown(item)}`);
            }
            lines.push('');
        }

        // Content Guidelines
        const contentGuidelines = editorialPatch.content_guidelines?.rules ?? [];
        if (contentGuidelines.length > 0) {
            lines.push('## Editorial: Content Guidelines');
            lines.push('');
            for (const item of contentGuidelines) {
                lines.push(`- ${escapeMarkdown(item)}`);
            }
            lines.push('');
        }
    }

    return lines.join('\n');
}

/**
 * Escape special markdown characters for plain-text contexts (titles, lists, paragraphs).
 * Preserves * and _ so that LLM-generated editorial formatting (bold/italic) survives.
 */
function escapeMarkdown(text: string): string {
    if (!text) return '';
    return text
        .replace(/\|/g, '\\|')
        .replace(/\n/g, ' ')
        .replace(/\[/g, '\\[')
        .replace(/\]/g, '\\]')
        .replace(/`/g, '\\`');
}

/**
 * Escape special markdown characters for table cell contexts.
 * Extends escapeMarkdown by also escaping * and _ which could break table formatting.
 */
function escapeMarkdownTableCell(text: string): string {
    return escapeMarkdown(text)
        .replace(/\*/g, '\\*')
        .replace(/_/g, '\\_');
}

/**
 * Create a slug from component title
 * @param title - Component title
 * @returns URL-safe slug
 */
export function createComponentSlug(title: string): string {
    const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 80);

    // Fallback for empty slug (e.g., title with only special chars)
    return slug || 'untitled-component';
}
