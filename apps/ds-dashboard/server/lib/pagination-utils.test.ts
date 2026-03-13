/**
 * Pagination Utils Tests
 * 
 * Unit tests for pagination utilities.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parsePaginationParams, applyPagination, toResourceLinks } from './pagination-utils.ts';

describe('parsePaginationParams', () => {
    it('should return default values for empty params', () => {
        const result = parsePaginationParams({});
        assert.strictEqual(result.limit, 500);
        assert.strictEqual(result.offset, 0);
    });

    it('should parse numeric limit', () => {
        const result = parsePaginationParams({ limit: 50 });
        assert.strictEqual(result.limit, 50);
    });

    it('should parse string limit', () => {
        const result = parsePaginationParams({ limit: '25' });
        assert.strictEqual(result.limit, 25);
    });

    it('should clamp negative limit to 1', () => {
        const result = parsePaginationParams({ limit: -10 });
        assert.strictEqual(result.limit, 1);
    });

    it('should clamp limit > 500 to 500', () => {
        const result = parsePaginationParams({ limit: 1000 });
        assert.strictEqual(result.limit, 500);
    });

    it('should clamp limit of 0 to 1', () => {
        const result = parsePaginationParams({ limit: 0 });
        assert.strictEqual(result.limit, 1);
    });

    it('should parse numeric offset', () => {
        const result = parsePaginationParams({ offset: 100 });
        assert.strictEqual(result.offset, 100);
    });

    it('should clamp negative offset to 0', () => {
        const result = parsePaginationParams({ offset: -5 });
        assert.strictEqual(result.offset, 0);
    });

    it('should handle both limit and offset', () => {
        const result = parsePaginationParams({ limit: 25, offset: 50 });
        assert.strictEqual(result.limit, 25);
        assert.strictEqual(result.offset, 50);
    });

    it('should handle invalid string values with defaults', () => {
        const result = parsePaginationParams({ limit: 'abc', offset: 'xyz' });
        assert.strictEqual(result.limit, 500); // default
        assert.strictEqual(result.offset, 0);  // default
    });
});

describe('applyPagination', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    it('should return first page of items', () => {
        const result = applyPagination(items, { limit: 3, offset: 0 });
        assert.strictEqual(result.items.length, 3);
        assert.deepStrictEqual(result.items, [1, 2, 3]);
        assert.strictEqual(result.total, 10);
        assert.strictEqual(result.hasMore, true);
    });

    it('should return middle page of items', () => {
        const result = applyPagination(items, { limit: 3, offset: 3 });
        assert.strictEqual(result.items.length, 3);
        assert.deepStrictEqual(result.items, [4, 5, 6]);
        assert.strictEqual(result.hasMore, true);
    });

    it('should return last page of items', () => {
        const result = applyPagination(items, { limit: 3, offset: 9 });
        assert.strictEqual(result.items.length, 1);
        assert.deepStrictEqual(result.items, [10]);
        assert.strictEqual(result.hasMore, false);
    });

    it('should return empty array when offset >= total', () => {
        const result = applyPagination(items, { limit: 3, offset: 15 });
        assert.strictEqual(result.items.length, 0);
        assert.deepStrictEqual(result.items, []);
        assert.strictEqual(result.hasMore, false);
    });

    it('should handle limit exceeding remaining items', () => {
        const result = applyPagination(items, { limit: 10, offset: 8 });
        assert.strictEqual(result.items.length, 2);
        assert.deepStrictEqual(result.items, [9, 10]);
        assert.strictEqual(result.hasMore, false);
    });

    it('should return all items when no pagination params', () => {
        const result = applyPagination(items, { limit: 500, offset: 0 });
        assert.strictEqual(result.items.length, 10);
        assert.strictEqual(result.hasMore, false);
    });
});

describe('toResourceLinks', () => {
    it('should convert variables to resource links', () => {
        const variables = [
            { id: '1', name: 'Color/Primary', resolvedType: 'COLOR' },
            { id: '2', name: 'Spacing/Small', resolvedType: 'FLOAT' },
        ];

        const result = toResourceLinks(variables);

        assert.strictEqual(result.length, 2);
        assert.strictEqual(result[0].type, 'resource_link');
        assert.strictEqual(result[0].id, '1');
        assert.strictEqual(result[0].name, 'Color/Primary');
        assert.strictEqual(result[0].resolvedType, 'COLOR');
        assert.strictEqual(result[1].id, '2');
    });

    it('should handle variables without resolvedType', () => {
        const variables = [
            { id: '1', name: 'Test' },
        ];

        const result = toResourceLinks(variables);

        assert.strictEqual(result[0].resolvedType, undefined);
    });

    it('should return empty array for empty input', () => {
        const result = toResourceLinks([]);
        assert.strictEqual(result.length, 0);
    });
});
