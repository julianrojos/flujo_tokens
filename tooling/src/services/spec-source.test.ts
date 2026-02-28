import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseFigmaUrl, resolveFigmaSource } from './spec-source.js';

describe('spec-source', () => {
  describe('parseFigmaUrl()', () => {
    it('extracts file key and node id from search params', () => {
      const parsed = parseFigmaUrl(
        'https://www.figma.com/design/FILE123/Components?node-id=123-456'
      );

      assert.deepEqual(parsed, {
        fileKey: 'FILE123',
        nodeId: '123:456',
      });
    });

    it('extracts node id from hash params', () => {
      const parsed = parseFigmaUrl(
        'https://www.figma.com/file/FILE999/Name#node-id=9-10'
      );

      assert.deepEqual(parsed, {
        fileKey: 'FILE999',
        nodeId: '9:10',
      });
    });

    it('returns empty values for invalid urls', () => {
      const parsed = parseFigmaUrl('not-a-url');

      assert.deepEqual(parsed, { fileKey: '', nodeId: '' });
    });

    it('returns empty node id when the url has no node parameter', () => {
      const parsed = parseFigmaUrl('https://www.figma.com/file/FILE999/Name');

      assert.deepEqual(parsed, {
        fileKey: 'FILE999',
        nodeId: '',
      });
    });
  });

  describe('resolveFigmaSource()', () => {
    it('throws if no source is provided', () => {
      assert.throws(
        () => resolveFigmaSource({ figmaUrl: '', nodeId: '', rawComponentName: '' }),
        /Missing Figma source/
      );
    });

    it('resolves with valid figmaUrl', () => {
      const resolved = resolveFigmaSource({
        figmaUrl: 'https://www.figma.com/design/FILE123/Components?node-id=123-456',
        nodeId: '',
        rawComponentName: '',
      });

      assert.deepEqual(resolved, {
        fileKeyFromUrl: 'FILE123',
        nodeId: '123:456',
      });
    });

    it('resolves with explicit nodeId', () => {
      const resolved = resolveFigmaSource({
        figmaUrl: '',
        nodeId: '9:10',
        rawComponentName: '',
      });

      assert.deepEqual(resolved, {
        fileKeyFromUrl: '',
        nodeId: '9:10',
      });
    });

    it('prioritizes explicit nodeId over url nodeId', () => {
      const resolved = resolveFigmaSource({
        figmaUrl: 'https://www.figma.com/design/FILE123/Components?node-id=123-456',
        nodeId: '9:10',
        rawComponentName: '',
      });

      assert.deepEqual(resolved, {
        fileKeyFromUrl: 'FILE123',
        nodeId: '9:10',
      });
    });

    it('throws when figmaUrl has no node id and no raw component name', () => {
      assert.throws(
        () =>
          resolveFigmaSource({
            figmaUrl: 'https://www.figma.com/file/FILE999/Name',
            nodeId: '',
            rawComponentName: '',
          }),
        /No node-id found in Figma URL/
      );
    });

    it('allows rawComponentName without url for deferred resolution', () => {
      const resolved = resolveFigmaSource({
        figmaUrl: '',
        nodeId: '',
        rawComponentName: 'Button',
      });

      assert.deepEqual(resolved, {
        fileKeyFromUrl: '',
        nodeId: '',
      });
    });

    it('allows rawComponentName with url and no node id', () => {
      const resolved = resolveFigmaSource({
        figmaUrl: 'https://www.figma.com/file/FILE999/Name',
        nodeId: '',
        rawComponentName: 'Button',
      });

      assert.deepEqual(resolved, {
        fileKeyFromUrl: 'FILE999',
        nodeId: '',
      });
    });
  });
});
