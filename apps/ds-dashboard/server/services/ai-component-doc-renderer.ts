/**
 * Component Documentation Renderer
 * Converts ComponentDocOutput into markdown following project conventions
 */

import type { ComponentDocOutput } from './ai-component-doc-schema.js';

/**
 * Render ComponentDocOutput to markdown
 * @param output - Validated component doc output
 * @returns Markdown string
 */
export function renderComponentDoc(output: ComponentDocOutput): string {
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
                `| ${escapeMarkdown(item.name)} | ${item.type} | ${escapeMarkdown(item.description)} | ${item.optional ? 'Yes' : 'No'} |`
            );
            // Render children if present
            if (item.children && item.children.length > 0) {
                for (const child of item.children) {
                    lines.push(
                        `| ↳ ${escapeMarkdown(child.name)} | ${child.type} | ${escapeMarkdown(child.description)} | ${child.optional ? 'Yes' : 'No'} |`
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
                `| ${escapeMarkdown(variant.name)} | ${escapeMarkdown(variant.description)} | ${propsStr} |`
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
            lines.push(
                `| ${escapeMarkdown(token.name)} | \`${token.value}\` | ${token.type} | ${escapeMarkdown(token.description || '-')} |`
            );
        }
    }
    lines.push('');

    // Accessibility section
    lines.push('## Accessibility');
    lines.push('');
    if (output.accessibilityNotes.length === 0) {
        lines.push('None documented.');
    } else {
        for (const note of output.accessibilityNotes) {
            lines.push(`- ${escapeMarkdown(note)}`);
        }
    }

    return lines.join('\n');
}

/**
 * Escape special markdown characters
 * @param text - Text to escape
 * @returns Escaped text
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
