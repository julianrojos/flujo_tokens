/**
 * Renderer tests for AI component documentation
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderComponentDoc, createComponentSlug } from './ai-component-doc-renderer.js';
import { createValidComponentDocFixture } from './ai-component-doc-schema.js';
import type { EditorialPatch } from './ai-editorial-patch-schema.js';

describe('ai-component-doc-renderer', () => {
    describe('renderComponentDoc', () => {
        it('renders fixture with all core sections', () => {
            const output = createValidComponentDocFixture({
                metadata: {
                    generatedAt: '2024-01-01T00:00:00.000Z',
                    provider: 'anthropic',
                    model: 'claude-sonnet-4-20250514',
                },
            });

            const result = renderComponentDoc(output);

            assert.ok(result.includes('ai.schema_version: 2'));
            assert.ok(result.includes('# Button'));
            assert.ok(result.includes('## Anatomy'));
            assert.ok(result.includes('## Variants'));
            assert.ok(result.includes('## Design Tokens'));
            assert.ok(result.includes('## Accessibility'));
        });

        it('handles empty anatomy gracefully', () => {
            const output = createValidComponentDocFixture({ anatomy: [] });
            const result = renderComponentDoc(output);
            assert.ok(result.includes('## Anatomy'));
            assert.ok(result.includes('None documented.'));
        });

        it('handles empty variants gracefully', () => {
            const output = createValidComponentDocFixture({ variants: [] });
            const result = renderComponentDoc(output);
            assert.ok(result.includes('## Variants'));
            assert.ok(result.includes('None documented.'));
        });

        it('handles empty tokens gracefully', () => {
            const output = createValidComponentDocFixture({ tokens: [] });
            const result = renderComponentDoc(output);
            assert.ok(result.includes('## Design Tokens'));
            assert.ok(result.includes('None documented.'));
        });

        it('renders accessibility facts when notes are empty', () => {
            const output = createValidComponentDocFixture({
                accessibilityNotes: [],
                accessibilityFacts: [
                    { fact: 'Focus order follows DOM order', source: 'inferred' },
                ],
            });
            const result = renderComponentDoc(output);
            assert.ok(result.includes('Focus order follows DOM order (inferred)'));
        });

        it('shows explicit TBD when accessibility notes and facts are empty', () => {
            const output = createValidComponentDocFixture({
                accessibilityNotes: [],
                accessibilityFacts: [],
            });
            const result = renderComponentDoc(output);
            assert.ok(result.includes('## Accessibility'));
            assert.ok(result.includes('TBD (pending accessibility validation).'));
        });

        it('adds unresolved variable fallback description from token value', () => {
            const output = createValidComponentDocFixture({
                tokens: [
                    {
                        name: 'fills',
                        value: 'VariableID:1:12',
                        type: 'color',
                    },
                ],
            });

            const result = renderComponentDoc(output);
            assert.ok(result.includes('Token reference unresolved from Figma variable id.'));
        });

        it('preserves stable markdown table format for variants and tokens', () => {
            const output = createValidComponentDocFixture({
                variants: [
                    {
                        id: 'accent-default',
                        name: 'Accent/Default',
                        description: 'Accent emphasis variant',
                        properties: { Variant: 'Accent', State: 'Default' },
                    },
                ],
                tokens: [
                    {
                        name: 'container-fill',
                        value: '#111111',
                        type: 'color',
                        description: 'Container fill color',
                    },
                ],
            });

            const result = renderComponentDoc(output);
            assert.ok(result.includes('| Name | Description | Properties |'));
            assert.ok(result.includes('| Accent/Default | Accent emphasis variant | Variant: Accent, State: Default |'));
            assert.ok(result.includes('| Name | Value | Type | Description |'));
            assert.ok(result.includes('| container-fill | `#111111` | color | Container fill color |'));
        });

        it('escapes special characters in title', () => {
            const output = createValidComponentDocFixture({
                title: 'Test | Button [Primary]',
            });
            const result = renderComponentDoc(output);
            assert.ok(result.includes('# Test \\| Button \\[Primary\\]'));
        });

        it('escapes emphasis markers in table cell content but preserves them in lists', () => {
            const output = createValidComponentDocFixture({
                tokens: [
                    {
                        name: 'content_rule',
                        value: '#111111',
                        type: 'color',
                        description: 'Use *required* _labels_ only',
                    },
                ],
                accessibilityNotes: ['Use _aria-label_ when *text* is missing'],
            });
            const result = renderComponentDoc(output);
            // Table cells should escape * and _
            assert.ok(result.includes('Use \\*required\\* \\_labels\\_ only'));
            // List content should preserve markdown formatting
            assert.ok(result.includes('Use _aria-label_ when *text* is missing'));
        });

        it('renders base markdown without editorial patch (backwards compatible)', () => {
            const output = createValidComponentDocFixture();
            const result = renderComponentDoc({ output, editorialPatch: null });
            assert.ok(result.includes('# Button'));
            assert.ok(result.includes('## Anatomy'));
            assert.doesNotMatch(result, /Editorial:/);
        });

        it('appends editorial sections when editorialPatch is provided', () => {
            const output = createValidComponentDocFixture();
            const patch: EditorialPatch = {
                schemaVersion: 2,
                summary: {
                    purpose: 'Use for primary actions',
                    when_to_use: 'When user needs clear CTA',
                    when_not_to_use: 'Avoid for secondary actions',
                },
                best_practices: {
                    do: ['Use consistent sizing', 'Provide clear labels'],
                    dont: ['Mix sizes in same group', 'Use without text'],
                },
                related_components: ['Icon', 'Text'],
                qa: ['Verify hover state works', 'Check focus order'],
                content_guidelines: { rules: ['Use sentence case', 'Keep labels under 3 words'] },
                accessibility: { role: 'button', labeling: { rules: ['Must have aria-label if icon-only'] }, notes: [] },
            };
            const result = renderComponentDoc({ output, editorialPatch: patch });

            assert.ok(result.includes('## Editorial: Purpose & Usage'));
            assert.ok(result.includes('**Purpose:** Use for primary actions'));
            assert.ok(result.includes('**When to use:** When user needs clear CTA'));
            assert.ok(result.includes('## Editorial: Best Practices'));
            assert.ok(result.includes('### Do'));
            assert.ok(result.includes('### Don\'t'));
            assert.ok(result.includes('## Editorial: Related Components'));
            assert.ok(result.includes('## Editorial: QA Checklist'));
            assert.ok(result.includes('## Editorial: Content Guidelines'));
        });

        it('skips empty editorial sections gracefully', () => {
            const output = createValidComponentDocFixture();
            const patch: EditorialPatch = {
                schemaVersion: 2,
                summary: { purpose: 'Only purpose' },
                best_practices: { do: [], dont: [] },
                related_components: [],
                qa: [],
                content_guidelines: { rules: [] },
                accessibility: { role: 'button', labeling: { rules: [] }, notes: [] },
            };
            const result = renderComponentDoc({ output, editorialPatch: patch });

            assert.ok(result.includes('## Editorial: Purpose & Usage'));
            assert.doesNotMatch(result, /Best Practices/);
            assert.doesNotMatch(result, /Related Components/);
            assert.doesNotMatch(result, /QA Checklist/);
            assert.doesNotMatch(result, /Content Guidelines/);
        });

        it('preserves base sections unchanged when editorial patch is provided', () => {
            const output = createValidComponentDocFixture({
                anatomy: [{ name: 'Container', type: 'FRAME', description: 'Main wrapper', optional: false }],
                variants: [{ id: 'v1', name: 'Default', description: 'Default variant', properties: { State: 'Default' } }],
                tokens: [{ name: 'fill', value: '#000', type: 'color', description: 'Background' }],
                accessibilityNotes: ['Keyboard accessible'],
            });
            const patch: EditorialPatch = {
                schemaVersion: 2,
                summary: { purpose: 'Test purpose' },
                best_practices: { do: [], dont: [] },
                related_components: [],
                qa: [],
                content_guidelines: { rules: [] },
                accessibility: { role: 'button', labeling: { rules: [] }, notes: [] },
            };
            const result = renderComponentDoc({ output, editorialPatch: patch });

            // Base sections still present
            assert.ok(result.includes('## Anatomy'));
            assert.ok(result.includes('## Variants'));
            assert.ok(result.includes('## Design Tokens'));
            assert.ok(result.includes('## Accessibility'));
            // Editorial appended after
            assert.ok(result.includes('## Editorial: Purpose & Usage'));
        });

        it('R-002: preserves **bold** and _italic_ in editorial paragraph content', () => {
            const output = createValidComponentDocFixture();
            const patch: EditorialPatch = {
                schemaVersion: 2,
                summary: {
                    purpose: 'Use for **primary** actions and _critical_ CTAs',
                    when_to_use: 'When you need _strong_ visual **hierarchy**',
                    when_not_to_use: 'Avoid for **secondary** items',
                },
                best_practices: {
                    do: ['Use **consistent** sizing', 'Provide _clear_ labels'],
                    dont: ['Mix _sizes_ in same **group**'],
                },
                related_components: [],
                qa: ['Verify **hover** state'],
                content_guidelines: { rules: ['Use _sentence_ case'] },
                accessibility: { role: 'button', labeling: { rules: [] }, notes: [] },
            };
            const result = renderComponentDoc({ output, editorialPatch: patch });

            // Editorial paragraphs preserve markdown formatting
            assert.ok(result.includes('**primary**'));
            assert.ok(result.includes('_critical_'));
            assert.ok(result.includes('_strong_'));
            assert.ok(result.includes('_clear_'));
            assert.ok(result.includes('**secondary**'));
            assert.ok(result.includes('**consistent**'));
        });

        it('R-002: escapes * and _ in table cell content to prevent format breakage', () => {
            const output = createValidComponentDocFixture({
                anatomy: [{ name: 'Button_*wrapper', type: 'FRAME', description: 'Has * and _ chars', optional: false }],
            });
            const result = renderComponentDoc(output);
            assert.ok(result.includes('Button\\_\\*wrapper'));
            assert.ok(result.includes('Has \\* and \\_ chars'));
        });
    });

    describe('createComponentSlug', () => {
        it('creates slug from title', () => {
            assert.equal(createComponentSlug('Button'), 'button');
        });

        it('handles spaces and special chars', () => {
            assert.equal(createComponentSlug('Primary Button'), 'primary-button');
        });

        it('collapses multiple hyphens', () => {
            assert.equal(createComponentSlug('Primary  Button'), 'primary-button');
        });

        it('trims leading/trailing hyphens', () => {
            assert.equal(createComponentSlug('-Button-'), 'button');
        });

        it('limits to 80 chars', () => {
            const longTitle = 'a'.repeat(100);
            const slug = createComponentSlug(longTitle);
            assert.ok(slug.length <= 80);
        });

        it('falls back when title cannot produce a slug', () => {
            assert.equal(createComponentSlug('!!!'), 'untitled-component');
        });
    });
});
