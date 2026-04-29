/**
 * Renderer tests for AI component documentation
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderComponentDoc, createComponentSlug, renderEditorialPatchToMarkdown, renderEditorialEntryToMarkdown } from './ai-component-doc-renderer.js';
import { createValidComponentDocFixture } from './ai-component-doc-schema.js';
import { EDITORIAL_PATCH_SCHEMA_VERSION, type EditorialPatch } from './ai-editorial-patch-schema.js';
import type { EditorialEntry } from '../db/component-repository.js';
import type { FigmaDescriptionsResult } from './figma-descriptions-resolver.js';

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

            assert.ok(result.includes('# Button'));
            assert.ok(result.includes('## Variants'));
            assert.doesNotMatch(result, /^## Design Tokens$/m);
            assert.ok(result.includes('## Accessibility'));
        });

        it('does not render anatomy and design tokens sections', () => {
            const output = createValidComponentDocFixture();
            const result = renderComponentDoc(output);
            assert.doesNotMatch(result, /^## Anatomy$/m);
            assert.doesNotMatch(result, /^## Design Tokens$/m);
        });

        it('handles empty variants gracefully', () => {
            const output = createValidComponentDocFixture({ variants: [] });
            const result = renderComponentDoc(output);
            assert.ok(result.includes('## Variants'));
            assert.ok(result.includes('None documented.'));
        });

        it('does not render removed token section', () => {
            const output = createValidComponentDocFixture();
            const result = renderComponentDoc(output);
            assert.doesNotMatch(result, /^## Design Tokens$/m);
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

        it('preserves stable markdown table format for variants', () => {
            const output = createValidComponentDocFixture({
                variants: [
                    {
                        id: 'accent-default',
                        name: 'Accent/Default',
                        description: 'Accent emphasis variant',
                        properties: { Variant: 'Accent', State: 'Default' },
                    },
                ],
            });

            const result = renderComponentDoc(output);
            assert.ok(result.includes('| Name | Description | Properties |'));
            assert.ok(result.includes('| Accent/Default | Accent emphasis variant | Variant: Accent, State: Default |'));
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
                variants: [
                    {
                        id: 'v1',
                        name: 'Default',
                        description: 'Use *required* _labels_ only',
                        properties: { State: 'Default' },
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
                qa: ['Verify hover state works', 'Check focus order'],
                content_guidelines: { rules: ['Use sentence case', 'Keep labels under 3 words'] },
                behavior: {
                    interactionPattern: 'trigger',
                    description: 'Activating this component triggers the primary action for the current view.',
                    inferredFrom: 'component name and visible pressed state',
                    notes: ['[To confirm with dev] Keyboard trigger parity.'],
                },
                accessibility: { role: 'button', labeling: { rules: ['Must have aria-label if icon-only'] }, notes: [] },
            };
            const result = renderComponentDoc({ output, editorialPatch: patch });

            assert.ok(result.includes('## Editorial: Purpose & Usage'));
            assert.ok(result.includes('**Purpose:** Use for primary actions'));
            assert.ok(result.includes('**When to use:** When user needs clear CTA'));
            assert.ok(result.includes('## Editorial: QA Checklist'));
            assert.ok(result.includes('## Editorial: Content Guidelines'));
            assert.ok(result.includes('## Editorial: Behavior'));
            assert.ok(result.includes('**Interaction pattern:** trigger'));
        });

        it('skips empty editorial sections gracefully', () => {
            const output = createValidComponentDocFixture();
            const patch: EditorialPatch = {
                schemaVersion: 2,
                summary: { purpose: 'Only purpose' },
                qa: [],
                content_guidelines: { rules: [] },
                accessibility: { role: 'button', labeling: { rules: [] }, notes: [] },
            };
            const result = renderComponentDoc({ output, editorialPatch: patch });

            assert.ok(result.includes('## Editorial: Purpose & Usage'));
            assert.doesNotMatch(result, /Best Practices/);
            assert.doesNotMatch(result, /QA Checklist/);
            assert.doesNotMatch(result, /Content Guidelines/);
        });

        it('preserves base sections unchanged when editorial patch is provided', () => {
            const output = createValidComponentDocFixture({
                variants: [{ id: 'v1', name: 'Default', description: 'Default variant', properties: { State: 'Default' } }],
                accessibilityNotes: ['Keyboard accessible'],
            });
            const patch: EditorialPatch = {
                schemaVersion: 2,
                summary: { purpose: 'Test purpose' },
                qa: [],
                content_guidelines: { rules: [] },
                accessibility: { role: 'button', labeling: { rules: [] }, notes: [] },
            };
            const result = renderComponentDoc({ output, editorialPatch: patch });

            // Base sections still present
            assert.ok(result.includes('## Variants'));
            assert.doesNotMatch(result, /^## Design Tokens$/m);
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
                qa: ['Verify **hover** state'],
                content_guidelines: { rules: ['Use _sentence_ case'] },
                accessibility: { role: 'button', labeling: { rules: [] }, notes: [] },
            };
            const result = renderComponentDoc({ output, editorialPatch: patch });

            // Editorial paragraphs preserve markdown formatting
            assert.ok(result.includes('**primary**'));
            assert.ok(result.includes('_critical_'));
            assert.ok(result.includes('_strong_'));
            assert.ok(result.includes('**secondary**'));
        });

        it('R-002: escapes * and _ in variants table cell content to prevent format breakage', () => {
            const output = createValidComponentDocFixture({
                variants: [{ id: 'v1', name: 'Button_*wrapper', description: 'Has * and _ chars', properties: { State: 'Default' } }],
            });
            const result = renderComponentDoc(output);
            assert.ok(result.includes('Button\\_\\*wrapper'));
            assert.ok(result.includes('Has \\* and \\_ chars'));
        });

        it('renders Figma component set description when provided', () => {
            const output = createValidComponentDocFixture();
            const figmaDescriptions: FigmaDescriptionsResult = {
                componentSet: 'A configurable button component from Figma.',
                variants: [],
                syncedAt: Math.floor(Date.now() / 1000),
                stale: false,
            };
            const result = renderComponentDoc(output, figmaDescriptions);
            assert.ok(result.includes('> _Figma description:_ A configurable button component from Figma.'));
        });

        it('does not render Figma description when componentSet is null', () => {
            const output = createValidComponentDocFixture();
            const figmaDescriptions: FigmaDescriptionsResult = {
                componentSet: null,
                variants: [],
                syncedAt: Math.floor(Date.now() / 1000),
                stale: false,
            };
            const result = renderComponentDoc(output, figmaDescriptions);
            assert.ok(!result.includes('_Figma description:_'));
        });

        it('does not render Figma description when componentSet is empty string', () => {
            const output = createValidComponentDocFixture();
            const figmaDescriptions: FigmaDescriptionsResult = {
                componentSet: '',
                variants: [],
                syncedAt: Math.floor(Date.now() / 1000),
                stale: false,
            };
            const result = renderComponentDoc(output, figmaDescriptions);
            assert.ok(!result.includes('_Figma description:_'));
        });

        it('adds Figma Description column in variants table when figmaDescriptions provided', () => {
            const output = createValidComponentDocFixture({
                variants: [
                    { id: 'v1', name: 'Default', description: 'Default variant', properties: { State: 'Default' } },
                ],
            });
            const figmaDescriptions: FigmaDescriptionsResult = {
                componentSet: null,
                variants: [
                    { nodeId: 'v1', canonicalKey: 'State=Default', description: 'From Figma: the default state.' },
                ],
                syncedAt: Math.floor(Date.now() / 1000),
                stale: false,
            };
            const result = renderComponentDoc(output, figmaDescriptions);
            assert.ok(result.includes('| Name | Description | Properties | Figma Description |'));
            assert.ok(result.includes('From Figma: the default state.'));
        });

        it('matches variant description by canonicalKey when nodeId not available', () => {
            const output = createValidComponentDocFixture({
                variants: [
                    { name: 'Large', description: 'Large variant', properties: { Size: 'lg' } },
                ],
            });
            const figmaDescriptions: FigmaDescriptionsResult = {
                componentSet: null,
                variants: [
                    { nodeId: 'unknown', canonicalKey: 'Size=lg', description: 'Large size from Figma.' },
                ],
                syncedAt: Math.floor(Date.now() / 1000),
                stale: false,
            };
            const result = renderComponentDoc(output, figmaDescriptions);
            assert.ok(result.includes('Large size from Figma.'));
        });

        it('AI summary cannot override figmaDescriptions.componentSet', () => {
            const output = createValidComponentDocFixture({
                summary: 'AI-generated summary about the button.',
            });
            const figmaDescriptions: FigmaDescriptionsResult = {
                componentSet: 'Figma description: authoritative source.',
                variants: [],
                syncedAt: Math.floor(Date.now() / 1000),
                stale: false,
            };
            const result = renderComponentDoc(output, figmaDescriptions);
            // Figma description appears before AI summary
            const figmaPos = result.indexOf('_Figma description:_');
            const aiPos = result.indexOf('AI-generated summary');
            assert.ok(figmaPos < aiPos, 'Figma description should appear before AI summary');
        });

        it('output identical when figmaDescriptions is null', () => {
            const output = createValidComponentDocFixture();
            const withNull = renderComponentDoc(output, null);
            const without = renderComponentDoc(output);
            assert.equal(withNull, without);
        });

        it('output identical when figmaDescriptions is undefined', () => {
            const output = createValidComponentDocFixture();
            const withUndefined = renderComponentDoc(output, undefined);
            const without = renderComponentDoc(output);
            assert.equal(withUndefined, without);
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

    describe('renderEditorialPatchToMarkdown', () => {
        it('returns empty string for null/undefined', () => {
            assert.equal(renderEditorialPatchToMarkdown(null), '');
            assert.equal(renderEditorialPatchToMarkdown(undefined), '');
        });

        it('renders partial patch with only summary', () => {
            const patch: EditorialPatch = {
                schemaVersion: EDITORIAL_PATCH_SCHEMA_VERSION,
                summary: { purpose: 'Test purpose' },
            };
            const md = renderEditorialPatchToMarkdown(patch);
            assert.ok(md.includes('## Summary'));
            assert.ok(md.includes('Test purpose'));
            assert.ok(!md.includes('## Best Practices'));
        });

        it('renders full patch with all sections', () => {
            const patch: EditorialPatch = {
                schemaVersion: EDITORIAL_PATCH_SCHEMA_VERSION,
                summary: { purpose: 'P', when_to_use: 'W', when_not_to_use: 'N' },
                content_guidelines: { rules: ['Rule 1'] },
                behavior: { interactionPattern: 'disclosure', description: 'Reveals additional content on activation.' },
                accessibility: { role: 'button', labeling: { rules: ['Label A'] }, notes: ['Note Z'] },
                qa: ['Check A'],
            };
            const md = renderEditorialPatchToMarkdown(patch);
            assert.ok(md.includes('## Summary'));
            assert.ok(md.includes('## Content Guidelines'));
            assert.ok(md.includes('## Behavior'));
            assert.ok(md.includes('## Accessibility'));
            assert.ok(md.includes('## QA'));
            assert.ok(md.includes('Check A'));
        });
    });

    describe('renderEditorialEntryToMarkdown', () => {
        it('returns empty string for null/undefined', () => {
            assert.equal(renderEditorialEntryToMarkdown(null), '');
            assert.equal(renderEditorialEntryToMarkdown(undefined), '');
        });

        it('renders entry with summary only', () => {
            const entry: EditorialEntry = {
                componentId: 1,
                summary: { purpose: 'DB purpose' } as Record<string, unknown>,
                updatedAt: Date.now(),
            };
            const md = renderEditorialEntryToMarkdown(entry);
            assert.ok(md.includes('## Summary'));
            assert.ok(md.includes('DB purpose'));
        });

        it('handles entry with all fields populated', () => {
            const entry: EditorialEntry = {
                componentId: 2,
                summary: { purpose: 'P', when_to_use: 'W', when_not_to_use: 'N' },
                behaviour: 'Activating this component reveals a related panel.',
                contentGuidelines: { rules: ['Rule X'] },
                accessibility: { role: 'dialog', labeling: { rules: ['L1'] }, notes: ['N1'] },
                qa: ['QA1'],
                updatedAt: Date.now(),
            };
            const md = renderEditorialEntryToMarkdown(entry);
            assert.ok(md.includes('## Summary'));
            assert.ok(md.includes('## Behavior'));
            assert.ok(md.includes('## Content Guidelines'));
            assert.ok(md.includes('## Accessibility'));
            assert.ok(md.includes('## QA'));
            assert.ok(md.includes('P'));
            assert.ok(md.includes('QA1'));
        });
    });
});
