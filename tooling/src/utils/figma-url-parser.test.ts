import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseFigmaUrl } from './figma-url-parser.js';

describe('parseFigmaUrl', () => {
  describe('standard Figma URLs', () => {
    it('extracts fileKey and nodeId from design URL with node-id param', () => {
      const result = parseFigmaUrl('https://www.figma.com/design/ABC123/MyFile?node-id=1:2');
      assert.deepStrictEqual(result, { fileKey: 'ABC123', nodeId: '1:2' });
    });

    it('extracts fileKey and nodeId from file URL with node-id param', () => {
      const result = parseFigmaUrl('https://www.figma.com/file/XYZ789/AnotherFile?node-id=999:888');
      assert.deepStrictEqual(result, { fileKey: 'XYZ789', nodeId: '999:888' });
    });

    it('extracts fileKey when nodeId is missing', () => {
      const result = parseFigmaUrl('https://www.figma.com/design/ABC123/MyFile');
      assert.deepStrictEqual(result, { fileKey: 'ABC123', nodeId: '' });
    });
  });

  describe('nodeId in hash', () => {
    it('extracts nodeId from hash with node-id param', () => {
      const result = parseFigmaUrl('https://www.figma.com/design/ABC123/MyFile#node-id=3:4');
      assert.deepStrictEqual(result, { fileKey: 'ABC123', nodeId: '3:4' });
    });

    it('extracts nodeId from hash with node_id param', () => {
      const result = parseFigmaUrl('https://www.figma.com/design/ABC123/MyFile#node_id=5:6');
      assert.deepStrictEqual(result, { fileKey: 'ABC123', nodeId: '5:6' });
    });

    it('extracts nodeId from hash with nodeId param', () => {
      const result = parseFigmaUrl('https://www.figma.com/design/ABC123/MyFile#nodeId=7:8');
      assert.deepStrictEqual(result, { fileKey: 'ABC123', nodeId: '7:8' });
    });

    it('extracts nodeId from hash without leading ?', () => {
      const result = parseFigmaUrl('https://www.figma.com/design/ABC123/MyFile#node-id=9:10');
      assert.deepStrictEqual(result, { fileKey: 'ABC123', nodeId: '9:10' });
    });

    it('extracts nodeId from hash with node- notation', () => {
      const result = parseFigmaUrl('https://www.figma.com/design/ABC123/MyFile#node-id=11:12');
      assert.deepStrictEqual(result, { fileKey: 'ABC123', nodeId: '11:12' });
    });
  });

  describe('alternative nodeId parameter names', () => {
    it('handles node_id (underscore) in query params', () => {
      const result = parseFigmaUrl('https://www.figma.com/design/ABC123/MyFile?node_id=1:2');
      assert.deepStrictEqual(result, { fileKey: 'ABC123', nodeId: '1:2' });
    });

    it('handles nodeId (camelCase) in query params', () => {
      const result = parseFigmaUrl('https://www.figma.com/design/ABC123/MyFile?nodeId=3:4');
      assert.deepStrictEqual(result, { fileKey: 'ABC123', nodeId: '3:4' });
    });

    it('prioritizes node-id over other variants', () => {
      const result = parseFigmaUrl('https://www.figma.com/design/ABC123/MyFile?node-id=1:2&node_id=9:9');
      assert.deepStrictEqual(result, { fileKey: 'ABC123', nodeId: '1:2' });
    });
  });

  describe('edge cases', () => {
    it('returns empty for null input', () => {
      const result = parseFigmaUrl(null as any);
      assert.deepStrictEqual(result, { fileKey: '', nodeId: '' });
    });

    it('returns empty for undefined input', () => {
      const result = parseFigmaUrl(undefined as any);
      assert.deepStrictEqual(result, { fileKey: '', nodeId: '' });
    });

    it('returns empty for empty string', () => {
      const result = parseFigmaUrl('');
      assert.deepStrictEqual(result, { fileKey: '', nodeId: '' });
    });

    it('returns empty for invalid URL', () => {
      const result = parseFigmaUrl('not-a-url');
      assert.deepStrictEqual(result, { fileKey: '', nodeId: '' });
    });

    it('extracts fileKey from non-standard URL (parser is permissive)', () => {
      // Note: The parser is permissive and extracts fileKey from any URL with /file/ pattern
      const result = parseFigmaUrl('https://example.com/file/ABC123');
      assert.deepStrictEqual(result, { fileKey: 'ABC123', nodeId: '' });
    });

    it('handles URL with complex pathname', () => {
      const result = parseFigmaUrl('https://www.figma.com/design/ABC123/MyFile/Version1?node-id=1:2');
      assert.deepStrictEqual(result, { fileKey: 'ABC123', nodeId: '1:2' });
    });

    it('normalizes hyphenated nodeId to colon format', () => {
      const result = parseFigmaUrl('https://www.figma.com/design/ABC123/MyFile?node-id=123-456');
      assert.deepStrictEqual(result, { fileKey: 'ABC123', nodeId: '123:456' });
    });
  });

  describe('URL variations', () => {
    it('handles figma.com without www subdomain', () => {
      const result = parseFigmaUrl('https://figma.com/design/ABC123/MyFile?node-id=1:2');
      assert.deepStrictEqual(result, { fileKey: 'ABC123', nodeId: '1:2' });
    });

    it('handles subdomain.figma.com URLs', () => {
      const result = parseFigmaUrl('https://app.figma.com/design/ABC123/MyFile?node-id=1:2');
      assert.deepStrictEqual(result, { fileKey: 'ABC123', nodeId: '1:2' });
    });

    it('handles URL with additional query params', () => {
      const result = parseFigmaUrl('https://www.figma.com/design/ABC123/MyFile?foo=bar&node-id=1:2&baz=qux');
      assert.deepStrictEqual(result, { fileKey: 'ABC123', nodeId: '1:2' });
    });

    it('handles URL with hash and query params', () => {
      const result = parseFigmaUrl('https://www.figma.com/design/ABC123/MyFile?foo=bar#node-id=1:2');
      assert.deepStrictEqual(result, { fileKey: 'ABC123', nodeId: '1:2' });
    });
  });
});
