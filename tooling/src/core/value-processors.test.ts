/**
 * Tests for value processors (Typography, Border, Shadow, etc.)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import type { EmissionContext } from '../types/tokens.js';
import { TypographyValueProcessor, BorderValueProcessor, StringValueProcessor, AliasValueProcessor, ShadowValueProcessor } from './value-processors.js';
import { ReferenceResolver } from './reference-resolver.js';

// Mock context for testing
function createMockContext(): EmissionContext {
    return {
        summary: {
            totalTokens: 0,
            successCount: 0,
            unresolvedRefs: [],
            invalidNames: [],
            circularDeps: 0,
            depthLimitHits: 0,
            cssVarNameCollisions: 0,
            cssVarNameCollisionDetails: [],
            invalidTokens: [],
            tokenTypeCounts: {},
            countedTokenKeys: new Set(),
            countedGeneratedKeys: new Set(),
            countedTokenTypeKeys: new Set(),
        },
        refMap: new Map(),
        valueMap: new Map(),
        collisionKeys: new Set(),
        idToVarName: new Map(),
        idToTokenKey: new Map(),
        tokensData: {},
        cycleStatus: new Map(),
        emittableKeys: new Set(),
        cssVarNameOwners: new Map(),
        cssVarNameCollisionMap: new Map(),
    };
}

describe('TypographyValueProcessor', () => {
    const processor = new TypographyValueProcessor();
    const ctx = createMockContext();
    const currentPath = ['test', 'typography'];

    describe('canProcess', () => {
        it('returns true for typography type with object value', () => {
            assert.strictEqual(processor.canProcess({ fontSize: 16 }, 'typography'), true);
        });

        it('returns false for non-typography type', () => {
            assert.strictEqual(processor.canProcess({ fontSize: 16 }, 'color'), false);
        });

        it('returns false for non-object values', () => {
            assert.strictEqual(processor.canProcess('string', 'typography'), false);
            assert.strictEqual(processor.canProcess(123, 'typography'), false);
        });
    });

    describe('process - numeric values', () => {
        it('fontSize: 16 => 16px', () => {
            const result = processor.process({
                ctx,
                value: { fontSize: 16, fontFamily: 'Arial' },
                varType: 'typography',
                currentPath,
                resolver: {} as any,
            });
            assert.strictEqual(result, '16px Arial');
        });

        it('fontWeight: 400 => 400 (unitless)', () => {
            const result = processor.process({
                ctx,
                value: { fontSize: 16, fontWeight: 400, fontFamily: 'Arial' },
                varType: 'typography',
                currentPath,
                resolver: {} as any,
            });
            assert.strictEqual(result, '400 16px Arial');
        });

        it('fontWeight: 700 => 700 (unitless)', () => {
            const result = processor.process({
                ctx,
                value: { fontSize: 16, fontWeight: 700, fontFamily: 'Arial' },
                varType: 'typography',
                currentPath,
                resolver: {} as any,
            });
            assert.strictEqual(result, '700 16px Arial');
        });

        it('lineHeight: 1.5 => 1.5 (unitless)', () => {
            const result = processor.process({
                ctx,
                value: { fontSize: 16, lineHeight: 1.5, fontFamily: 'Arial' },
                varType: 'typography',
                currentPath,
                resolver: {} as any,
            });
            assert.strictEqual(result, '16px/1.5 Arial');
        });

        it('lineHeight: 2 => 2 (unitless)', () => {
            const result = processor.process({
                ctx,
                value: { fontSize: 16, lineHeight: 2, fontFamily: 'Arial' },
                varType: 'typography',
                currentPath,
                resolver: {} as any,
            });
            assert.strictEqual(result, '16px/2 Arial');
        });

        it('lineHeight: 24 => 24 (unitless, not 24px)', () => {
            const result = processor.process({
                ctx,
                value: { fontSize: 16, lineHeight: 24, fontFamily: 'Arial' },
                varType: 'typography',
                currentPath,
                resolver: {} as any,
            });
            assert.strictEqual(result, '16px/24 Arial');
        });

        it('combined: fontSize + fontWeight + lineHeight', () => {
            const result = processor.process({
                ctx,
                value: {
                    fontSize: 16,
                    fontWeight: 400,
                    lineHeight: 1.5,
                    fontFamily: 'Arial',
                },
                varType: 'typography',
                currentPath,
                resolver: {} as any,
            });
            assert.strictEqual(result, '400 16px/1.5 Arial');
        });
    });

    describe('process - string values', () => {
        it('lineHeight: "24px" => 24px (preserved)', () => {
            const result = processor.process({
                ctx,
                value: { fontSize: 16, lineHeight: '24px', fontFamily: 'Arial' },
                varType: 'typography',
                currentPath,
                resolver: {} as any,
            });
            assert.strictEqual(result, '16px/24px Arial');
        });

        it('lineHeight: "1.5" => 1.5 (preserved)', () => {
            const result = processor.process({
                ctx,
                value: { fontSize: 16, lineHeight: '1.5', fontFamily: 'Arial' },
                varType: 'typography',
                currentPath,
                resolver: {} as any,
            });
            assert.strictEqual(result, '16px/1.5 Arial');
        });

        it('fontWeight: "bold" => bold (preserved)', () => {
            const result = processor.process({
                ctx,
                value: { fontSize: 16, fontWeight: 'bold', fontFamily: 'Arial' },
                varType: 'typography',
                currentPath,
                resolver: {} as any,
            });
            assert.strictEqual(result, 'bold 16px Arial');
        });

        it('fontFamily with spaces => quoted', () => {
            const result = processor.process({
                ctx,
                value: { fontSize: 16, fontFamily: 'Times New Roman' },
                varType: 'typography',
                currentPath,
                resolver: {} as any,
            });
            assert.strictEqual(result, '16px "Times New Roman"');
        });
    });

    describe('process - edge cases', () => {
        it('returns null when fontSize is missing', () => {
            const result = processor.process({
                ctx,
                value: { fontWeight: 400, fontFamily: 'Arial' },
                varType: 'typography',
                currentPath,
                resolver: {} as any,
            });
            assert.strictEqual(result, null);
        });

        it('returns null when fontFamily is missing', () => {
            const result = processor.process({
                ctx,
                value: { fontSize: 16, fontWeight: 400 },
                varType: 'typography',
                currentPath,
                resolver: {} as any,
            });
            assert.strictEqual(result, null);
        });

        it('returns null for non-object values', () => {
            const result = processor.process({
                ctx,
                value: 'string',
                varType: 'typography',
                currentPath,
                resolver: {} as any,
            });
            assert.strictEqual(result, null);
        });
    });
});

describe('BorderValueProcessor', () => {
    const processor = new BorderValueProcessor();
    const ctx = createMockContext();
    const currentPath = ['test', 'border'];

    describe('canProcess', () => {
        it('returns true for border type with object value', () => {
            assert.strictEqual(processor.canProcess({ width: 1, style: 'solid', color: '#000' }, 'border'), true);
        });

        it('returns false for non-border type', () => {
            assert.strictEqual(processor.canProcess({ width: 1, style: 'solid', color: '#000' }, 'color'), false);
        });

        it('returns false for non-object values', () => {
            assert.strictEqual(processor.canProcess('string', 'border'), false);
            assert.strictEqual(processor.canProcess(123, 'border'), false);
        });
    });

    describe('process - numeric values', () => {
        it('width: 1 => 1px', () => {
            const result = processor.process({
                ctx,
                value: { width: 1, style: 'solid', color: '#000' },
                varType: 'border',
                currentPath,
                resolver: {} as any,
            });
            assert.strictEqual(result, '1px solid #000');
        });

        it('width: 2.5 => 2.5px', () => {
            const result = processor.process({
                ctx,
                value: { width: 2.5, style: 'solid', color: '#000' },
                varType: 'border',
                currentPath,
                resolver: {} as any,
            });
            assert.strictEqual(result, '2.5px solid #000');
        });
    });

    describe('process - string values', () => {
        it('width: "2px" => 2px (preserved)', () => {
            const result = processor.process({
                ctx,
                value: { width: '2px', style: 'solid', color: '#000' },
                varType: 'border',
                currentPath,
                resolver: {} as any,
            });
            assert.strictEqual(result, '2px solid #000');
        });

        it('width: "thin" => thin (preserved)', () => {
            const result = processor.process({
                ctx,
                value: { width: 'thin', style: 'solid', color: '#000' },
                varType: 'border',
                currentPath,
                resolver: {} as any,
            });
            assert.strictEqual(result, 'thin solid #000');
        });

        it('color with var() => preserved', () => {
            const result = processor.process({
                ctx,
                value: { width: 1, style: 'solid', color: 'var(--color-border)' },
                varType: 'border',
                currentPath,
                resolver: {} as any,
            });
            assert.strictEqual(result, '1px solid var(--color-border)');
        });
    });

    describe('process - edge cases', () => {
        it('returns null when width is missing', () => {
            const result = processor.process({
                ctx,
                value: { style: 'solid', color: '#000' },
                varType: 'border',
                currentPath,
                resolver: {} as any,
            });
            assert.strictEqual(result, null);
        });

        it('returns null when style is missing', () => {
            const result = processor.process({
                ctx,
                value: { width: 1, color: '#000' },
                varType: 'border',
                currentPath,
                resolver: {} as any,
            });
            assert.strictEqual(result, null);
        });

        it('returns null when color is missing', () => {
            const result = processor.process({
                ctx,
                value: { width: 1, style: 'solid' },
                varType: 'border',
                currentPath,
                resolver: {} as any,
            });
            assert.strictEqual(result, null);
        });

        it('returns null for non-object values', () => {
            const result = processor.process({
                ctx,
                value: 'string',
                varType: 'border',
                currentPath,
                resolver: {} as any,
            });
            assert.strictEqual(result, null);
        });
    });
});

describe('TypographyValueProcessor - nested references', () => {
    const processor = new TypographyValueProcessor();
    const currentPath = ['test', 'typography'];

    it('resolves W3C references in fontFamily string', () => {
        const ctx = createMockContext();
        ctx.refMap.set('base.font.roboto', '--font-roboto');
        ctx.emittableKeys.add('base.font.roboto');

        const result = processor.process({
            ctx,
            value: { fontSize: 16, fontFamily: '{base.font.roboto}', fontWeight: 400 },
            varType: 'typography',
            currentPath,
            resolver: {} as any,
        });
        // W3C ref resolves to var(), fontFamily becomes var(--font-roboto)
        assert.ok(result?.includes('var(--font-roboto)'));
    });

    it('resolves W3C references in fontSize string', () => {
        const ctx = createMockContext();
        ctx.refMap.set('size.medium', '--size-medium');
        ctx.emittableKeys.add('size.medium');

        const result = processor.process({
            ctx,
            value: { fontSize: '{size.medium}', fontFamily: 'Arial', fontWeight: 400 },
            varType: 'typography',
            currentPath,
            resolver: {} as any,
        });
        // W3C ref resolves to var(), fontSize becomes var(--size-medium)
        assert.ok(result?.includes('var(--size-medium)'));
    });

    it('handles VARIABLE_ALIAS in fontFamily', () => {
        const ctx = createMockContext();
        ctx.idToVarName.set('figma-font-123', '--font-figma');
        ctx.idToTokenKey.set('figma-font-123', 'base.font.figma');
        ctx.emittableKeys.add('base.font.figma');

        const result = processor.process({
            ctx,
            value: {
                fontSize: 16,
                fontFamily: { type: 'VARIABLE_ALIAS', id: 'figma-font-123' },
                fontWeight: 400,
            },
            varType: 'typography',
            currentPath,
            resolver: {} as any,
        });
        assert.strictEqual(result, '400 16px var(--font-figma)');
    });

    it('handles multiple W3C references in same typography object', () => {
        const ctx = createMockContext();
        ctx.refMap.set('size.large', '--size-large');
        ctx.refMap.set('weight.bold', '--weight-bold');
        ctx.emittableKeys.add('size.large');
        ctx.emittableKeys.add('weight.bold');

        const result = processor.process({
            ctx,
            value: {
                fontSize: '{size.large}',
                fontFamily: 'Arial',
                fontWeight: '{weight.bold}',
            },
            varType: 'typography',
            currentPath,
            resolver: {} as any,
        });
        // Both refs resolve to var()
        assert.ok(result?.includes('var(--size-large)'));
        assert.ok(result?.includes('var(--weight-bold)'));
    });

    it('handles W3C reference cycle in typography gracefully', () => {
        const ctx = createMockContext();
        ctx.refMap.set('size.cycle', '--size-cycle');
        ctx.emittableKeys.add('size.cycle');
        ctx.cycleStatus.set('size.cycle', true); // Deep circular dependency cached

        const result = processor.process({
            ctx,
            value: { fontSize: '{size.cycle}', fontFamily: 'Arial' },
            varType: 'typography',
            currentPath,
            resolver: new ReferenceResolver({ ctx, currentPath }),
        });

        // Due to cycleStatus = true, it resolves to a comment and bumps circularDeps
        assert.ok(result?.includes('/* circular-ref: size.cycle */'));
        assert.strictEqual(ctx.summary.circularDeps, 1);
    });
});

describe('BorderValueProcessor - nested references', () => {
    const processor = new BorderValueProcessor();
    const currentPath = ['test', 'border'];

    it('resolves W3C reference in width string', () => {
        const ctx = createMockContext();
        ctx.refMap.set('border.width.thin', '--border-width-thin');
        ctx.emittableKeys.add('border.width.thin');

        const result = processor.process({
            ctx,
            value: { width: '{border.width.thin}', style: 'solid', color: '#000' },
            varType: 'border',
            currentPath,
            resolver: {} as any,
        });
        // W3C ref resolves to var()
        assert.ok(result?.includes('var(--border-width-thin)'));
    });

    it('resolves W3C reference in color string', () => {
        const ctx = createMockContext();
        ctx.refMap.set('color.border.primary', '--color-border-primary');
        ctx.emittableKeys.add('color.border.primary');

        const result = processor.process({
            ctx,
            value: { width: 2, style: 'solid', color: '{color.border.primary}' },
            varType: 'border',
            currentPath,
            resolver: {} as any,
        });
        // W3C ref resolves to var()
        assert.ok(result?.includes('var(--color-border-primary)'));
    });

    it('handles VARIABLE_ALIAS in color', () => {
        const ctx = createMockContext();
        ctx.idToVarName.set('figma-color-456', '--border-figma');
        ctx.idToTokenKey.set('figma-color-456', 'color.border.figma');
        ctx.emittableKeys.add('color.border.figma');

        const result = processor.process({
            ctx,
            value: {
                width: 2,
                style: 'solid',
                color: { type: 'VARIABLE_ALIAS', id: 'figma-color-456' },
            },
            varType: 'border',
            currentPath,
            resolver: {} as any,
        });
        assert.strictEqual(result, '2px solid var(--border-figma)');
    });

    it('handles multiple W3C references in same border object', () => {
        const ctx = createMockContext();
        ctx.refMap.set('border.width.thick', '--border-width-thick');
        ctx.refMap.set('color.border.danger', '--color-border-danger');
        ctx.emittableKeys.add('border.width.thick');
        ctx.emittableKeys.add('color.border.danger');

        const result = processor.process({
            ctx,
            value: {
                width: '{border.width.thick}',
                style: 'solid',
                color: '{color.border.danger}',
            },
            varType: 'border',
            currentPath,
            resolver: {} as any,
        });
        // Both refs resolve to var()
        assert.ok(result?.includes('var(--border-width-thick)'));
        assert.ok(result?.includes('var(--color-border-danger)'));
    });

    it('handles W3C reference cycle in border gracefully', () => {
        const ctx = createMockContext();
        ctx.refMap.set('color.border.cycle', '--color-border-cycle');
        ctx.emittableKeys.add('color.border.cycle');
        ctx.cycleStatus.set('color.border.cycle', true); // Deep circular dependency cached

        const result = processor.process({
            ctx,
            value: { width: 1, style: 'solid', color: '{color.border.cycle}' },
            varType: 'border',
            currentPath,
            resolver: new ReferenceResolver({ ctx, currentPath }),
        });

        assert.ok(result?.includes('/* circular-ref: color.border.cycle */'));
        assert.strictEqual(ctx.summary.circularDeps, 1);
    });
});

describe('ShadowValueProcessor - nested references', () => {
    const processor = new ShadowValueProcessor();
    const currentPath = ['test', 'shadow'];

    it('resolves W3C references in multiple dimension properties', () => {
        const ctx = createMockContext();
        ctx.refMap.set('shadow.offset.x', '--shadow-offset-x');
        ctx.refMap.set('shadow.radius.lg', '--shadow-radius-lg');
        ctx.emittableKeys.add('shadow.offset.x');
        ctx.emittableKeys.add('shadow.radius.lg');

        const result = processor.process({
            ctx,
            value: {
                type: 'DROP_SHADOW',
                offset: { x: '{shadow.offset.x}', y: 4 },
                radius: '{shadow.radius.lg}',
                spread: 0,
                color: 'rgba(0,0,0,0.5)',
            },
            varType: 'shadow',
            currentPath,
            resolver: new ReferenceResolver({ ctx, currentPath }),
        });

        assert.ok(result?.includes('var(--shadow-offset-x)'));
        assert.ok(result?.includes('var(--shadow-radius-lg)'));
    });

    it('resolves VARIABLE_ALIAS in color property', () => {
        const ctx = createMockContext();
        ctx.idToVarName.set('figma-color-shadow', '--color-shadow-figma');
        ctx.idToTokenKey.set('figma-color-shadow', 'color.shadow.figma');
        ctx.emittableKeys.add('color.shadow.figma');

        const result = processor.process({
            ctx,
            value: {
                type: 'DROP_SHADOW',
                offset: { x: 0, y: 4 },
                radius: 8,
                spread: 0,
                color: { type: 'VARIABLE_ALIAS', id: 'figma-color-shadow' },
            },
            varType: 'shadow',
            currentPath,
            resolver: new ReferenceResolver({ ctx, currentPath }),
        });

        assert.strictEqual(result, '0px 4px 8px 0px var(--color-shadow-figma)');
    });

    it('handles self-reference/cycles in shadow gracefully', () => {
        const ctx = createMockContext();
        ctx.refMap.set('shadow.bad.color', '--shadow-bad-color');
        ctx.emittableKeys.add('shadow.bad.color');
        ctx.cycleStatus.set('shadow.bad.color', true);

        const result = processor.process({
            ctx,
            value: {
                type: 'DROP_SHADOW',
                offset: { x: 0, y: 4 },
                radius: 4,
                spread: 0,
                color: '{shadow.bad.color}',
            },
            varType: 'shadow',
            currentPath,
            resolver: new ReferenceResolver({ ctx, currentPath }),
        });

        assert.ok(result?.includes('/* circular-ref: shadow.bad.color */'));
        assert.strictEqual(ctx.summary.circularDeps, 1);
    });
});
