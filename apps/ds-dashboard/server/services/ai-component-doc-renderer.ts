/**
 * Component Documentation Renderer
 * Converts ComponentDocOutput into markdown following project conventions
 */

import type { ComponentDocOutput } from './ai-component-doc-schema.js';
import {
    type EditorialPatch,
} from './ai-editorial-patch-schema.js';
import type { EditorialEntry } from '../db/component-repository.js';
import type { FigmaDescriptionsResult } from './figma-descriptions-resolver.js';
import { buildCanonicalKey } from './figma-descriptions-resolver.js';
import { entryToEditorialPatch } from './editorial-entry-to-patch.js';

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
 * PRECEDENCE: If figmaDescriptions is provided, Figma descriptions from DB
 * are rendered before any AI-generated content. This is enforced by
 * resolveDescriptionsForRender() — do not add description resolution elsewhere.
 *
 * @param input - Render options (or ComponentDocOutput for backwards compat)
 * @param figmaDescriptions - Optional Figma descriptions from DB (DB always wins)
 * @returns Markdown string
 */
export function renderComponentDoc(
    input: RenderComponentDocOptions | ComponentDocOutput,
    figmaDescriptions?: FigmaDescriptionsResult | null,
): string {
    const output: ComponentDocOutput = 'output' in input ? input.output : input;
    const editorialPatch: EditorialPatch | null | undefined = 'output' in input ? input.editorialPatch : null;

    const lines: string[] = [];

    // Title
    lines.push(`# ${escapeMarkdown(output.title)}`);
    lines.push('');

    // Figma component set description (DB always wins)
    const figmaComponentSetDesc = figmaDescriptions?.componentSet?.trim();
    if (figmaComponentSetDesc) {
        lines.push(`> _Figma description:_ ${escapeMarkdown(figmaComponentSetDesc)}`);
        lines.push('');
    }

    // Summary
    lines.push(output.summary);
    lines.push('');

    // Variants section
    lines.push('## Variants');
    lines.push('');
    if (output.variants.length === 0) {
        lines.push('None documented.');
    } else {
        const hasFigmaDescriptions = !!figmaDescriptions?.variants?.length;
        if (hasFigmaDescriptions) {
            lines.push('| Name | Description | Properties | Figma Description |');
            lines.push('|------|-------------|------------|-------------------|');
        } else {
            lines.push('| Name | Description | Properties |');
            lines.push('|------|-------------|------------|');
        }
        for (const variant of output.variants) {
            const propsStr = Object.entries(variant.properties)
                .map(([k, v]) => `${k}: ${v}`)
                .join(', ');

            // Match Figma description by nodeId or canonicalKey
            let figmaVariantDesc: string | null = null;
            if (hasFigmaDescriptions) {
                // PRECEDENCE: nodeId first, then canonicalKey fallback
                if (variant.id) {
                    const byNodeId = figmaDescriptions!.variants.find(v => v.nodeId === variant.id);
                    if (byNodeId?.description) figmaVariantDesc = byNodeId.description;
                }
                if (!figmaVariantDesc) {
                    const key = buildCanonicalKey(variant.properties ?? {});
                    const byKey = figmaDescriptions!.variants.find(v => v.canonicalKey === key);
                    if (byKey?.description) figmaVariantDesc = byKey.description;
                }
            }

            if (hasFigmaDescriptions) {
                lines.push(
                    `| ${escapeMarkdownTableCell(variant.name)} | ${escapeMarkdownTableCell(variant.description)} | ${propsStr} | ${figmaVariantDesc ? escapeMarkdownTableCell(figmaVariantDesc) : '-'} |`
                );
            } else {
                lines.push(
                    `| ${escapeMarkdownTableCell(variant.name)} | ${escapeMarkdownTableCell(variant.description)} | ${propsStr} |`
                );
            }
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

        // Behavior
        const behavior = editorialPatch.behavior;
        if (behavior && (behavior.interactionPattern || behavior.description || behavior.inferredFrom || behavior.notes?.length)) {
            lines.push('## Editorial: Behavior');
            lines.push('');
            if (behavior.interactionPattern) {
                lines.push(`**Interaction pattern:** ${escapeMarkdown(behavior.interactionPattern)}`);
            }
            if (behavior.description) {
                lines.push(`**Description:** ${escapeMarkdown(behavior.description)}`);
            }
            if (behavior.inferredFrom) {
                lines.push(`**Inferred from:** ${escapeMarkdown(behavior.inferredFrom)}`);
            }
            if (behavior.notes?.length) {
                lines.push('**Notes:**');
                for (const item of behavior.notes) lines.push(`- ${escapeMarkdown(item)}`);
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

// ---------------------------------------------------------------------------
// Editorial section renderers (diff source of truth for Modelo A)
// ---------------------------------------------------------------------------

/**
 * Render an EditorialPatch (proposed by the AI) to markdown.
 * Returns '' if patch is null/undefined.
 */
export function renderEditorialPatchToMarkdown(patch: EditorialPatch | null | undefined): string {
    if (!patch) return '';

    const lines: string[] = [];

    if (patch.summary?.purpose || patch.summary?.when_to_use || patch.summary?.when_not_to_use) {
        lines.push('## Summary');
        if (patch.summary?.purpose) lines.push(`**Purpose:** ${escapeMarkdown(patch.summary.purpose)}`);
        if (patch.summary?.when_to_use) lines.push(`**When to use:** ${escapeMarkdown(patch.summary.when_to_use)}`);
        if (patch.summary?.when_not_to_use) lines.push(`**When not to use:** ${escapeMarkdown(patch.summary.when_not_to_use)}`);
        lines.push('');
    }

    if (patch.content_guidelines?.rules?.length) {
        lines.push('## Content Guidelines');
        for (const item of patch.content_guidelines.rules) lines.push(`- ${escapeMarkdown(item)}`);
        lines.push('');
    }

    if (patch.behavior?.interactionPattern || patch.behavior?.description || patch.behavior?.inferredFrom || patch.behavior?.notes?.length) {
        lines.push('## Behavior');
        if (patch.behavior?.interactionPattern) {
            lines.push(`**Interaction pattern:** ${escapeMarkdown(patch.behavior.interactionPattern)}`);
        }
        if (patch.behavior?.description) {
            lines.push(`**Description:** ${escapeMarkdown(patch.behavior.description)}`);
        }
        if (patch.behavior?.inferredFrom) {
            lines.push(`**Inferred from:** ${escapeMarkdown(patch.behavior.inferredFrom)}`);
        }
        if (patch.behavior?.notes?.length) {
            lines.push('**Notes:**');
            for (const item of patch.behavior.notes) lines.push(`- ${escapeMarkdown(item)}`);
        }
        lines.push('');
    }

    if (patch.accessibility?.role || patch.accessibility?.labeling?.rules?.length || patch.accessibility?.notes?.length) {
        lines.push('## Accessibility');
        if (patch.accessibility?.role) lines.push(`**Role:** ${escapeMarkdown(patch.accessibility.role)}`);
        if (patch.accessibility?.labeling?.rules?.length) {
            lines.push('**Labeling:**');
            for (const item of patch.accessibility.labeling.rules) lines.push(`- ${escapeMarkdown(item)}`);
        }
        if (patch.accessibility?.notes?.length) {
            lines.push('**Notes:**');
            for (const item of patch.accessibility.notes) lines.push(`- ${escapeMarkdown(item)}`);
        }
        lines.push('');
    }

    if (patch.qa?.length) {
        lines.push('## QA');
        for (const item of patch.qa) lines.push(`- ${escapeMarkdown(item)}`);
        lines.push('');
    }

    return lines.join('\n');
}

/**
 * Render an EditorialEntry (stored in DB as Record<string, unknown>) to markdown.
 * Reconstructs a partial EditorialPatch from the raw DB fields and delegates
 * to renderEditorialPatchToMarkdown.
 * Returns '' if entry is null/undefined.
 */
export function renderEditorialEntryToMarkdown(entry: EditorialEntry | null | undefined): string {
    return renderEditorialPatchToMarkdown(entryToEditorialPatch(entry));
}
