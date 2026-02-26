import { describe, it } from 'node:test';
import assert from 'node:assert';
import { normalizeNodeId, isValidNodeId, FIGMA_NODE_ID_RE } from './figma-node-id.js';

describe('FIGMA_NODE_ID_RE', () => {
  it('matches valid node IDs with colon separator', () => {
    assert.strictEqual(FIGMA_NODE_ID_RE.test('123:456'), true);
    assert.strictEqual(FIGMA_NODE_ID_RE.test('1:2'), true);
    assert.strictEqual(FIGMA_NODE_ID_RE.test('999999:888888'), true);
  });

  it('rejects invalid node IDs', () => {
    assert.strictEqual(FIGMA_NODE_ID_RE.test('123-456'), false);
    assert.strictEqual(FIGMA_NODE_ID_RE.test('abc:def'), false);
    assert.strictEqual(FIGMA_NODE_ID_RE.test('123'), false);
    assert.strictEqual(FIGMA_NODE_ID_RE.test('123:'), false);
    assert.strictEqual(FIGMA_NODE_ID_RE.test(':456'), false);
    assert.strictEqual(FIGMA_NODE_ID_RE.test(''), false);
  });
});

describe('normalizeNodeId', () => {
  it('returns empty string for null/undefined/empty input', () => {
    assert.strictEqual(normalizeNodeId(null), '');
    assert.strictEqual(normalizeNodeId(undefined), '');
    assert.strictEqual(normalizeNodeId(''), '');
    assert.strictEqual(normalizeNodeId('   '), '');
  });

  it('returns colon-separated format as-is', () => {
    assert.strictEqual(normalizeNodeId('123:456'), '123:456');
    assert.strictEqual(normalizeNodeId('1:2'), '1:2');
  });

  it('converts hyphen-separated to colon-separated', () => {
    assert.strictEqual(normalizeNodeId('123-456'), '123:456');
    assert.strictEqual(normalizeNodeId('1-2'), '1:2');
  });

  it('trims whitespace', () => {
    assert.strictEqual(normalizeNodeId('  123:456  '), '123:456');
    assert.strictEqual(normalizeNodeId('  123-456  '), '123:456');
  });

  it('handles malformed hyphen input', () => {
    assert.strictEqual(normalizeNodeId('123--456'), '123:456');
    assert.strictEqual(normalizeNodeId('-123-456'), '123:456');
    assert.strictEqual(normalizeNodeId('123-456-'), '123:456');
  });

  it('returns non-matching input as-is', () => {
    assert.strictEqual(normalizeNodeId('abc'), 'abc');
    assert.strictEqual(normalizeNodeId('123'), '123');
  });
});

describe('isValidNodeId', () => {
  it('returns true for valid colon-separated IDs', () => {
    assert.strictEqual(isValidNodeId('123:456'), true);
    assert.strictEqual(isValidNodeId('1:2'), true);
  });

  it('returns true for valid hyphen-separated IDs (normalizes internally)', () => {
    assert.strictEqual(isValidNodeId('123-456'), true);
    assert.strictEqual(isValidNodeId('1-2'), true);
  });

  it('returns false for null/undefined/empty input', () => {
    assert.strictEqual(isValidNodeId(null), false);
    assert.strictEqual(isValidNodeId(undefined), false);
    assert.strictEqual(isValidNodeId(''), false);
    assert.strictEqual(isValidNodeId('   '), false);
  });

  it('returns false for invalid formats', () => {
    assert.strictEqual(isValidNodeId('abc'), false);
    assert.strictEqual(isValidNodeId('123'), false);
    assert.strictEqual(isValidNodeId('123:'), false);
    assert.strictEqual(isValidNodeId(':456'), false);
    assert.strictEqual(isValidNodeId('abc:def'), false);
  });

  it('trims whitespace before validation', () => {
    assert.strictEqual(isValidNodeId('  123:456  '), true);
    assert.strictEqual(isValidNodeId('  123-456  '), true);
  });
});
