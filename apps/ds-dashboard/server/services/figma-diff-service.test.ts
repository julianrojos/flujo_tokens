import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  computeContentFingerprint,
  diffFigmaVsDb,
  type DbComponentRef,
  type FigmaNodeSnapshot,
} from './figma-diff-service.js';

describe('figma-diff-service', () => {
  it('classifies a new component not in DB as new_in_figma', () => {
    const figmaSnapshots: FigmaNodeSnapshot[] = [
      {
        nodeId: '10:1',
        name: 'Button',
        type: 'COMPONENT',
        pageName: 'Components',
        variantCount: 1,
        contentFingerprint: computeContentFingerprint({
          name: 'Button',
          type: 'COMPONENT',
          pageName: 'Components',
          variantCount: 1,
        }),
      },
    ];

    const result = diffFigmaVsDb(figmaSnapshots, []);

    assert.deepStrictEqual(result.new_in_figma, figmaSnapshots);
    assert.deepStrictEqual(result.updated_in_figma, []);
    assert.deepStrictEqual(result.unchanged, []);
    assert.deepStrictEqual(result.missing_in_figma, []);
  });

  it('classifies component with changed fingerprint as updated_in_figma', () => {
    const figmaSnapshot: FigmaNodeSnapshot = {
      nodeId: '10:2',
      name: 'Button Primary',
      type: 'COMPONENT',
      pageName: 'Components',
      variantCount: 2,
      contentFingerprint: computeContentFingerprint({
        name: 'Button Primary',
        type: 'COMPONENT',
        pageName: 'Components',
        variantCount: 2,
      }),
    };
    const dbComponent: DbComponentRef = {
      id: 1,
      nodeId: '10:2',
      slug: 'button',
      name: 'Button',
      status: 'ready',
      contentFingerprint: computeContentFingerprint({
        name: 'Button',
        type: 'COMPONENT',
        pageName: 'Components',
        variantCount: 1,
      }),
    };

    const result = diffFigmaVsDb([figmaSnapshot], [dbComponent]);

    assert.deepStrictEqual(result.new_in_figma, []);
    assert.deepStrictEqual(result.updated_in_figma, [{ figma: figmaSnapshot, db: dbComponent }]);
    assert.deepStrictEqual(result.unchanged, []);
    assert.deepStrictEqual(result.missing_in_figma, []);
  });

  it('classifies component with same fingerprint as unchanged', () => {
    const figmaSnapshot: FigmaNodeSnapshot = {
      nodeId: '10:3',
      name: 'Card',
      type: 'COMPONENT',
      pageName: 'Components',
      variantCount: 0,
      contentFingerprint: computeContentFingerprint({
        name: 'Card',
        type: 'COMPONENT',
        pageName: 'Components',
        variantCount: 0,
      }),
    };
    const dbComponent: DbComponentRef = {
      id: 1,
      nodeId: '10:3',
      slug: 'card',
      name: 'Card',
      status: 'ready',
      contentFingerprint: figmaSnapshot.contentFingerprint,
    };

    const result = diffFigmaVsDb([figmaSnapshot], [dbComponent]);

    assert.deepStrictEqual(result.new_in_figma, []);
    assert.deepStrictEqual(result.updated_in_figma, []);
    assert.deepStrictEqual(result.unchanged, [{ figma: figmaSnapshot, db: dbComponent }]);
    assert.deepStrictEqual(result.missing_in_figma, []);
  });

  it('classifies DB component not in Figma scan as missing_in_figma', () => {
    const dbComponent: DbComponentRef = {
      id: 1,
      nodeId: '10:4',
      slug: 'input',
      name: 'Input',
      status: 'ready',
      contentFingerprint: computeContentFingerprint({
        name: 'Input',
        type: 'COMPONENT',
        pageName: 'Components',
        variantCount: 1,
      }),
    };

    const result = diffFigmaVsDb([], [dbComponent]);

    assert.deepStrictEqual(result.new_in_figma, []);
    assert.deepStrictEqual(result.updated_in_figma, []);
    assert.deepStrictEqual(result.unchanged, []);
    assert.deepStrictEqual(result.missing_in_figma, [dbComponent]);
  });

  it('matches legacy DB components by slug when node id does not match', () => {
    const figmaSnapshot: FigmaNodeSnapshot = {
      nodeId: '1:23',
      name: 'Botón',
      slug: 'boton',
      type: 'COMPONENT',
      pageName: 'Page 1',
      variantCount: 0,
      contentFingerprint: computeContentFingerprint({
        name: 'Botón',
        type: 'COMPONENT',
        pageName: 'Page 1',
        variantCount: 0,
      }),
    };
    const dbComponent: DbComponentRef = {
      id: 1,
      nodeId: '',
      slug: 'boton',
      name: 'Botón',
      status: 'ready',
      contentFingerprint: figmaSnapshot.contentFingerprint,
    };

    const result = diffFigmaVsDb([figmaSnapshot], [dbComponent]);

    assert.deepStrictEqual(result.new_in_figma, []);
    assert.deepStrictEqual(result.unchanged, [{ figma: figmaSnapshot, db: dbComponent }]);
    assert.deepStrictEqual(result.missing_in_figma, []);
  });

  it('skips Figma candidates with empty node id', () => {
    const result = diffFigmaVsDb(
      [
        {
          nodeId: '',
          name: 'Ghost',
          type: 'COMPONENT',
          pageName: 'Components',
          variantCount: 0,
          contentFingerprint: computeContentFingerprint({
            name: 'Ghost',
            type: 'COMPONENT',
            pageName: 'Components',
            variantCount: 0,
          }),
        },
      ],
      [],
    );

    assert.deepStrictEqual(result.new_in_figma, []);
    assert.deepStrictEqual(result.updated_in_figma, []);
    assert.deepStrictEqual(result.unchanged, []);
    assert.deepStrictEqual(result.missing_in_figma, []);
  });

  it('treats DB component with null fingerprint as updated (conservative)', () => {
    const figmaSnapshot: FigmaNodeSnapshot = {
      nodeId: '10:5',
      name: 'Badge',
      type: 'COMPONENT',
      pageName: 'Components',
      variantCount: 1,
      contentFingerprint: computeContentFingerprint({
        name: 'Badge',
        type: 'COMPONENT',
        pageName: 'Components',
        variantCount: 1,
      }),
    };
    const dbComponent: DbComponentRef = {
      id: 1,
      nodeId: '10:5',
      slug: 'badge',
      name: 'Badge',
      status: 'ready',
      contentFingerprint: null,
    };

    const result = diffFigmaVsDb([figmaSnapshot], [dbComponent]);

    assert.deepStrictEqual(result.updated_in_figma, [{ figma: figmaSnapshot, db: dbComponent }]);
    assert.deepStrictEqual(result.unchanged, []);
    assert.deepStrictEqual(result.missing_in_figma, []);
  });

  it('does not mark DB components without figma_node_id as missing_in_figma', () => {
    const dbComponent: DbComponentRef = {
      id: 1,
      nodeId: '',
      slug: 'manual-component',
      name: 'Manual Component',
      status: 'ready',
      contentFingerprint: null,
    };

    const result = diffFigmaVsDb([], [dbComponent]);

    assert.deepStrictEqual(result.missing_in_figma, []);
  });

  it('still reports previously missing components as missing_in_figma', () => {
    const dbComponent: DbComponentRef = {
      id: 1,
      nodeId: '10:6',
      slug: 'alert',
      name: 'Alert',
      status: 'missing',
      contentFingerprint: computeContentFingerprint({
        name: 'Alert',
        type: 'COMPONENT',
        pageName: 'Components',
        variantCount: 1,
      }),
    };

    const result = diffFigmaVsDb([], [dbComponent]);

    assert.deepStrictEqual(result.missing_in_figma, [dbComponent]);
  });
});
