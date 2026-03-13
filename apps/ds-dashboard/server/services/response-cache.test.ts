import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { truncateArray, truncateString, ResponseCache } from './response-cache';

/**
 * Test truncateArray
 */
describe('truncateArray', () => {
    it('should keep array within max size', () => {
        const array = [1, 2, 3, 4, 5];
        const result = truncateArray(array, 3);
        assert.deepStrictEqual(result, [3, 4, 5]);
    });

    it('should return same array when under max size', () => {
        const array = [1, 2];
        const result = truncateArray(array, 3);
        assert.deepStrictEqual(result, [1, 2]);
    });
});

/**
 * Test truncateString
 */
describe('truncateString', () => {
    it('should truncate long string', () => {
        const result = truncateString('1234567890', 5);
        assert.strictEqual(result, '12345');
    });

    it('should return same string when under limit', () => {
        const result = truncateString('short', 10);
        assert.strictEqual(result, 'short');
    });
});

/**
 * Test ResponseCache
 */
describe('ResponseCache', () => {
    let cache: ResponseCache;

    beforeEach(() => {
        cache = new ResponseCache();
    });

    it('should store and retrieve data', () => {
        const data = { value: 'test' };

        // Set and get
        cache.set('file1', 'key1', data, 1000);
        const result = cache.get<typeof data>('file1', 'key1');

        assert.deepStrictEqual(result, data);
    });

    it('should expire data after TTL', async () => {
        // Set with 100ms TTL
        cache.set('file1', 'key1', { value: 'test' }, 100);

        // Wait 150ms
        await new Promise(r => setTimeout(r, 150));
        const result = cache.get<{ value: string }>('file1', 'key1');

        assert.strictEqual(result, null);
    });

    it('should return only non-expired active file keys', async () => {
        // Set data for 2 files with long TTL
        const data = { value: 'test' };

        cache.set('file1', 'key1', data, 1000);
        cache.set('file2', 'key2', data, 1000);

        // Set data for file3 with short TTL (will expire)
        cache.set('file3', 'key3', data, 50);

        // Wait for file3 to expire
        await new Promise(r => setTimeout(r, 100));

        // Only file1 and file2 should be active (file3 expired)
        const activeFileKeys = cache.getActiveFileKeys();
        assert.equal(activeFileKeys.includes('file1'), true);
        assert.equal(activeFileKeys.includes('file2'), true);
        assert.equal(activeFileKeys.includes('file3'), false);
        assert.equal(activeFileKeys.length, 2);
    });

    it('should invalidate file cache', () => {
        cache.set('file1', 'key1', { value: 'test' }, 1000);
        cache.invalidateFile('file1');

        assert.deepStrictEqual(cache.get('file1', 'key1'), null);
    });
});
