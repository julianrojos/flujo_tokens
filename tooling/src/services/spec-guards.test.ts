import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  assertBypassPolicy,
  assertFigmaSourceProvided,
  assertOutputPath,
  resolveFigmaSource,
} from './spec-guards.js';

describe('assertBypassPolicy', () => {
  it('does not throw when force is true and skipValidation is true', () => {
    assert.doesNotThrow(() => {
      assertBypassPolicy({ force: true, skipValidation: true, allowNonEvidenceUpdates: false });
    });
  });

  it('does not throw when force is true and allowNonEvidenceUpdates is true', () => {
    assert.doesNotThrow(() => {
      assertBypassPolicy({ force: true, skipValidation: false, allowNonEvidenceUpdates: true });
    });
  });

  it('throws when skipValidation is true without force', () => {
    assert.throws(
      () => {
        assertBypassPolicy({ force: false, skipValidation: true, allowNonEvidenceUpdates: false });
      },
      /Validation gate bypass requires explicit force/,
    );
  });

  it('throws when allowNonEvidenceUpdates is true without force', () => {
    assert.throws(
      () => {
        assertBypassPolicy({ force: false, skipValidation: false, allowNonEvidenceUpdates: true });
      },
      /Evidence gate bypass requires explicit force/,
    );
  });

  it('does not throw when all flags are false', () => {
    assert.doesNotThrow(() => {
      assertBypassPolicy({ force: false, skipValidation: false, allowNonEvidenceUpdates: false });
    });
  });
});

describe('assertFigmaSourceProvided', () => {
  it('does not throw when figmaUrl is provided', () => {
    assert.doesNotThrow(() => {
      assertFigmaSourceProvided({ figmaUrl: 'https://figma.com/file/ABC123', nodeId: undefined as any, rawComponentName: undefined as any });
    });
  });

  it('does not throw when nodeId is provided', () => {
    assert.doesNotThrow(() => {
      assertFigmaSourceProvided({ figmaUrl: undefined as any, nodeId: '1:2', rawComponentName: undefined as any });
    });
  });

  it('does not throw when rawComponentName is provided', () => {
    assert.doesNotThrow(() => {
      assertFigmaSourceProvided({ figmaUrl: undefined as any, nodeId: undefined as any, rawComponentName: 'Button' });
    });
  });

  it('throws when no source is provided', () => {
    assert.throws(
      () => {
        assertFigmaSourceProvided({ figmaUrl: undefined as any, nodeId: undefined as any, rawComponentName: undefined as any });
      },
      /Missing Figma source/,
    );
  });

  it('throws with helpful message listing alternatives', () => {
    assert.throws(
      () => {
        assertFigmaSourceProvided({ figmaUrl: undefined as any, nodeId: undefined as any, rawComponentName: undefined as any });
      },
      /--url <figma-url>/,
    );
  });
});

describe('assertOutputPath', () => {
  it('does not throw when outputPath is provided', () => {
    assert.doesNotThrow(() => {
      assertOutputPath('design-systems/sys-01/docs/_spec/components/button.yml');
    });
  });

  it('throws when outputPath is undefined', () => {
    assert.throws(
      () => {
        assertOutputPath(undefined as any);
      },
      /Missing output target/,
    );
  });

  it('throws with helpful message', () => {
    assert.throws(
      () => {
        assertOutputPath(undefined as any);
      },
      /--output or --component-name/,
    );
  });
});

describe('resolveFigmaSource', () => {
  it('extracts fileKey and nodeId from figmaUrl', () => {
    const result = resolveFigmaSource({
      figmaUrl: 'https://www.figma.com/design/ABC123/MyFile?node-id=1:2',
      nodeId: undefined as any,
      rawComponentName: undefined as any,
    });
    assert.deepStrictEqual(result, { fileKeyFromUrl: 'ABC123', nodeId: '1:2' });
  });

  it('uses explicit nodeId over URL nodeId', () => {
    const result = resolveFigmaSource({
      figmaUrl: 'https://www.figma.com/design/ABC123/MyFile?node-id=1:2',
      nodeId: '9:9',
      rawComponentName: undefined as any,
    });
    assert.deepStrictEqual(result, { fileKeyFromUrl: 'ABC123', nodeId: '9:9' });
  });

  it('throws when no source is provided', () => {
    assert.throws(
      () => {
        resolveFigmaSource({ figmaUrl: undefined as any, nodeId: undefined as any, rawComponentName: undefined as any });
      },
      /Missing Figma source/,
    );
  });

  it('returns empty when URL is invalid and no explicit nodeId', () => {
    const result = resolveFigmaSource({ figmaUrl: 'not-a-url', nodeId: undefined as any, rawComponentName: undefined as any });
    assert.deepStrictEqual(result, { fileKeyFromUrl: '', nodeId: '' });
  });

  it('succeeds with only rawComponentName (less deterministic)', () => {
    const result = resolveFigmaSource({
      figmaUrl: undefined as any,
      nodeId: undefined as any,
      rawComponentName: 'Button',
    });
    assert.deepStrictEqual(result, { fileKeyFromUrl: '', nodeId: '' });
  });
});
