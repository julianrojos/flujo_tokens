/**
 * Renderer tests for AI component documentation
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderComponentDoc, createComponentSlug } from './ai-component-doc-renderer.js';
import type { ComponentDocOutput } from './ai-component-doc-schema.js';

describe('ai-component-doc-renderer', () => {
    describe('renderComponentDoc', () => {
        it('should render full fixture with all sections', () => {
            const output: ComponentDocOutput = {
                schemaVersion: 1,
                componentId: '68:4097',
                title: 'Button',
                summary: 'A button component for triggering actions',
                anatomy: [
                    {
                        name: 'Container',
                        type: 'FRAME',
                        description: 'Main button container',
                        optional: false,
                    },
                ],
                variants: [
                    {
                        id: 'primary-default',
                        name: 'Primary/Default',
                        description: 'Default primary button',
                        properties: { variant: 'Primary', state: 'Default' },
                    },
                ],
                tokens: [
                    {
                        name: 'primary-fill',
                        value: '#007AFF',
                        type: 'color',
                        description: 'Background fill color',
                    },
                ],
                accessibilityNotes: [
                    'Button has accessible name from label',
                    'Supports keyboard navigation',
                ],
                markdown: '',
                metadata: {
                    generatedAt: '2024-01-01T00:00:00.000Z',
                    provider: 'anthropic',
                    model: 'claude-sonnet-4-20250514',
                },
            };

            const result = renderComponentDoc(output);
            const expectedSnapshot = `---
doc_type: component
doc_status: ai-draft
figma.component_set_node_id: 68:4097
ai.schema_version: 1
ai.generated_at: 2024-01-01T00:00:00.000Z
ai.provider: anthropic
ai.model: claude-sonnet-4-20250514
---

# Button

A button component for triggering actions

## Anatomy

| Name | Type | Description | Optional |
|------|------|-------------|----------|
| Container | FRAME | Main button container | No |

## Variants

| Name | Description | Properties |
|------|-------------|------------|
| Primary/Default | Default primary button | variant: Primary, state: Default |

## Design Tokens

| Name | Value | Type | Description |
|------|-------|------|-------------|
| primary-fill | \`#007AFF\` | color | Background fill color |

## Accessibility

- Button has accessible name from label
- Supports keyboard navigation`;

            assert.equal(result, expectedSnapshot);
        });

        it('should handle empty anatomy gracefully', () => {
            const output: ComponentDocOutput = {
                schemaVersion: 1,
                componentId: '68:4097',
                title: 'Test',
                summary: 'Test summary',
                anatomy: [],
                variants: [],
                tokens: [],
                accessibilityNotes: [],
                markdown: '',
            };

            const result = renderComponentDoc(output);

            assert.ok(result.includes('## Anatomy'));
            assert.ok(result.includes('None documented.'));
        });

        it('should handle empty variants gracefully', () => {
            const output: ComponentDocOutput = {
                schemaVersion: 1,
                componentId: '68:4097',
                title: 'Test',
                summary: 'Test summary',
                anatomy: [],
                variants: [],
                tokens: [],
                accessibilityNotes: [],
                markdown: '',
            };

            const result = renderComponentDoc(output);

            assert.ok(result.includes('## Variants'));
            assert.ok(result.includes('None documented.'));
        });

        it('should handle empty tokens gracefully', () => {
            const output: ComponentDocOutput = {
                schemaVersion: 1,
                componentId: '68:4097',
                title: 'Test',
                summary: 'Test summary',
                anatomy: [],
                variants: [],
                tokens: [],
                accessibilityNotes: [],
                markdown: '',
            };

            const result = renderComponentDoc(output);

            assert.ok(result.includes('## Design Tokens'));
            assert.ok(result.includes('None documented.'));
        });

        it('should handle empty accessibilityNotes gracefully', () => {
            const output: ComponentDocOutput = {
                schemaVersion: 1,
                componentId: '68:4097',
                title: 'Test',
                summary: 'Test summary',
                anatomy: [],
                variants: [],
                tokens: [],
                accessibilityNotes: [],
                markdown: '',
            };

            const result = renderComponentDoc(output);

            assert.ok(result.includes('## Accessibility'));
            assert.ok(result.includes('None documented.'));
        });

        it('should escape special characters in title', () => {
            const output: ComponentDocOutput = {
                schemaVersion: 1,
                componentId: '68:4097',
                title: 'Test | Button [Primary]',
                summary: 'Test summary',
                anatomy: [],
                variants: [],
                tokens: [],
                accessibilityNotes: [],
                markdown: '',
            };

            const result = renderComponentDoc(output);

            // Should escape pipe characters in tables
            assert.ok(result.includes('# Test \\| Button \\[Primary\\]'));
        });
    });

    describe('createComponentSlug', () => {
        it('should create slug from title', () => {
            assert.equal(createComponentSlug('Button'), 'button');
        });

        it('should handle spaces and special chars', () => {
            assert.equal(createComponentSlug('Primary Button'), 'primary-button');
        });

        it('should collapse multiple hyphens', () => {
            assert.equal(createComponentSlug('Primary  Button'), 'primary-button');
        });

        it('should trim leading/trailing hyphens', () => {
            assert.equal(createComponentSlug('-Button-'), 'button');
        });

        it('should limit to 80 chars', () => {
            const longTitle = 'a'.repeat(100);
            const slug = createComponentSlug(longTitle);
            assert.ok(slug.length <= 80);
        });

        it('should handle special characters', () => {
            assert.equal(createComponentSlug('Button!@#$%'), 'button');
        });
    });
});
