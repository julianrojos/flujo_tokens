import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    coerceSpecPropertyType,
    getSpecPropertyTypeInfo,
    hasCanonicalPropertyFieldOrder,
    getValidSpecPropertyTypes
} from './spec-property-types.js';

describe('spec-property-types', () => {
    describe('coerceSpecPropertyType()', () => {
        it('should return empty string for undefined/null/empty', () => {
            assert.strictEqual(coerceSpecPropertyType(undefined), '');
            assert.strictEqual(coerceSpecPropertyType(''), '');
        });

        it('should return canonical type for valid types', () => {
            assert.strictEqual(coerceSpecPropertyType('enum'), 'enum');
            assert.strictEqual(coerceSpecPropertyType('text'), 'text');
        });

        it('should handle aliases from JSON', () => {
            // "variant" is an alias for "enum" in property-type-map.json
            assert.strictEqual(coerceSpecPropertyType('variant'), 'enum');
        });

        it('should handle Figma display types', () => {
            assert.strictEqual(coerceSpecPropertyType('VARIANT'), 'enum');
            assert.strictEqual(coerceSpecPropertyType('TEXT'), 'text');
        });

        it('should be case-insensitive and trim whitespace', () => {
            assert.strictEqual(coerceSpecPropertyType('  ENUM  '), 'enum');
            assert.strictEqual(coerceSpecPropertyType('Boolean'), 'boolean');
        });

        it('should return empty string for unknown types', () => {
            assert.strictEqual(coerceSpecPropertyType('unknown_type'), '');
            // @ts-ignore - testing runtime safety
            assert.strictEqual(coerceSpecPropertyType(123), '');
        });
    });

    describe('getSpecPropertyTypeInfo()', () => {
        it('should return metadata for valid types', () => {
            const info = getSpecPropertyTypeInfo('enum');
            assert.ok(info);
            assert.strictEqual(info?.figmaDisplay, 'VARIANT');
            assert.strictEqual(info?.requiresValues, true);
        });

        it('should return null for invalid or empty types', () => {
            // @ts-ignore
            assert.strictEqual(getSpecPropertyTypeInfo('invalid'), null);
            assert.strictEqual(getSpecPropertyTypeInfo(''), null);
        });
    });

    describe('hasCanonicalPropertyFieldOrder()', () => {
        it('should return true for vacuous truth (non-arrays)', () => {
            assert.strictEqual(hasCanonicalPropertyFieldOrder(null), true);
            assert.strictEqual(hasCanonicalPropertyFieldOrder({}), true);
        });

        it('should skip null/undefined elements (YAML noise)', () => {
            assert.strictEqual(hasCanonicalPropertyFieldOrder([null, undefined]), true);
        });

        it('should fail if any element is not a plain object', () => {
            assert.strictEqual(hasCanonicalPropertyFieldOrder([[], {}]), false);
            assert.strictEqual(hasCanonicalPropertyFieldOrder(['string', {}]), false);
        });

        it('should validate canonical field order', () => {
            const valid = [
                { name: 'foo', type: 'text', description: 'desc' },
                { name: 'bar', type: 'enum', values: [], default: 'v', description: 'desc' }
            ];
            assert.strictEqual(hasCanonicalPropertyFieldOrder(valid), true);

            const invalid = [
                { type: 'text', name: 'foo' } // Wrong order
            ];
            assert.strictEqual(hasCanonicalPropertyFieldOrder(invalid), false);
        });
    });

    describe('configuration synchronization', () => {
        it('all valid types should have metadata', () => {
            const validTypes = getValidSpecPropertyTypes();
            for (const type of validTypes) {
                assert.ok(getSpecPropertyTypeInfo(type), `Type "${type}" should have metadata`);
            }
        });
    });
});
