import { describe, it } from 'node:test';
import assert from 'node:assert';
import { toDtcgTokenSet, figmaColorToHexDtcg } from './dtcg-transform.js';

// Mock Figma variable data
type MockVariable = {
  id: string;
  name: string;
  key: string;
  resolvedType: string;
  valuesByMode: Record<string, unknown>;
  variableCollectionId: string;
  scopes: string[];
  description: string;
  hiddenFromPublishing: boolean;
};

type MockCollection = {
  id: string;
  name: string;
  key: string;
  modes: Array<{ modeId: string; name: string }>;
  defaultModeId: string;
  variableIds: string[];
};

// Test cases
describe('toDtcgTokenSet', () => {
  it('should convert COLOR variable to DTCG format', () => {
    const variables: Record<string, MockVariable> = {
      'color-primary': {
        id: 'color-primary',
        name: 'colors/primary',
        key: 'color-primary',
        resolvedType: 'COLOR',
        valuesByMode: {
          'mode-dark': { r: 0.1, g: 0.2, b: 0.3, a: 1 },
        },
        variableCollectionId: 'collection-1',
        scopes: [],
        description: 'Primary color',
        hiddenFromPublishing: false,
      },
    };

    const collections: Record<string, MockCollection> = {
      'collection-1': {
        id: 'collection-1',
        name: 'Main Collection',
        key: 'collection-1',
        modes: [{ modeId: 'mode-dark', name: 'Dark' }],
        defaultModeId: 'mode-dark',
        variableIds: ['color-primary'],
      },
    };

    const result = toDtcgTokenSet(variables, collections);

    assert(result.hasOwnProperty('colors'));
    assert(result.colors.hasOwnProperty('primary'));
    assert.deepStrictEqual((result.colors as any).primary, {
      $value: '#1A334D',
      $type: 'color',
      $id: 'color-primary',
    });
  });

  it('should convert FLOAT variable to DTCG format', () => {
    const variables: Record<string, MockVariable> = {
      'spacing-small': {
        id: 'spacing-small',
        name: 'spacing/small',
        key: 'spacing-small',
        resolvedType: 'FLOAT',
        valuesByMode: {
          'mode-default': 8,
        },
        variableCollectionId: 'collection-1',
        scopes: [],
        description: 'Small spacing',
        hiddenFromPublishing: false,
      },
    };

    const collections: Record<string, MockCollection> = {
      'collection-1': {
        id: 'collection-1',
        name: 'Main Collection',
        key: 'collection-1',
        modes: [{ modeId: 'mode-default', name: 'Default' }],
        defaultModeId: 'mode-default',
        variableIds: ['spacing-small'],
      },
    };

    const result = toDtcgTokenSet(variables, collections);

    assert(result.hasOwnProperty('spacing'));
    assert(result.spacing.hasOwnProperty('small'));
    assert.deepStrictEqual((result.spacing as any).small, {
      $value: 8,
      $type: 'number',
      $id: 'spacing-small',
    });
  });

  it('should convert STRING variable to DTCG format', () => {
    const variables: Record<string, MockVariable> = {
      'font-primary': {
        id: 'font-primary',
        name: 'fonts/primary',
        key: 'font-primary',
        resolvedType: 'STRING',
        valuesByMode: {
          'mode-default': 'Roboto',
        },
        variableCollectionId: 'collection-1',
        scopes: [],
        description: 'Primary font',
        hiddenFromPublishing: false,
      },
    };

    const collections: Record<string, MockCollection> = {
      'collection-1': {
        id: 'collection-1',
        name: 'Main Collection',
        key: 'collection-1',
        modes: [{ modeId: 'mode-default', name: 'Default' }],
        defaultModeId: 'mode-default',
        variableIds: ['font-primary'],
      },
    };

    const result = toDtcgTokenSet(variables, collections);

    assert(result.hasOwnProperty('fonts'));
    assert(result.fonts.hasOwnProperty('primary'));
    assert.deepStrictEqual((result.fonts as any).primary, {
      $value: 'Roboto',
      $type: 'string',
      $id: 'font-primary',
    });
  });

  it('should convert BOOLEAN variable to DTCG format', () => {
    const variables: Record<string, MockVariable> = {
      'is-enabled': {
        id: 'is-enabled',
        name: 'flags/is-enabled',
        key: 'is-enabled',
        resolvedType: 'BOOLEAN',
        valuesByMode: {
          'mode-default': true,
        },
        variableCollectionId: 'collection-1',
        scopes: [],
        description: 'Feature enabled flag',
        hiddenFromPublishing: false,
      },
    };

    const collections: Record<string, MockCollection> = {
      'collection-1': {
        id: 'collection-1',
        name: 'Main Collection',
        key: 'collection-1',
        modes: [{ modeId: 'mode-default', name: 'Default' }],
        defaultModeId: 'mode-default',
        variableIds: ['is-enabled'],
      },
    };

    const result = toDtcgTokenSet(variables, collections);

    assert(result.hasOwnProperty('flags'));
    assert(result.flags.hasOwnProperty('is-enabled'));
    assert.deepStrictEqual((result.flags as any)['is-enabled'], {
      $value: true,
      $type: 'boolean',
      $id: 'is-enabled',
    });
  });

  it('should handle variable alias paths', () => {
    const variables: Record<string, MockVariable> = {
      'color-primary': {
        id: 'color-primary',
        name: 'colors/primary',
        key: 'color-primary',
        resolvedType: 'COLOR',
        valuesByMode: {
          'mode-dark': { r: 0.1, g: 0.2, b: 0.3, a: 1 },
        },
        variableCollectionId: 'collection-1',
        scopes: [],
        description: 'Primary color',
        hiddenFromPublishing: false,
      },
      'color-secondary': {
        id: 'color-secondary',
        name: 'colors/secondary',
        key: 'color-secondary',
        resolvedType: 'VARIABLE_ALIAS',
        valuesByMode: {
          'mode-dark': 'color-primary',
        },
        variableCollectionId: 'collection-1',
        scopes: [],
        description: 'Secondary color (alias)',
        hiddenFromPublishing: false,
      },
    };

    const collections: Record<string, MockCollection> = {
      'collection-1': {
        id: 'collection-1',
        name: 'Main Collection',
        key: 'collection-1',
        modes: [{ modeId: 'mode-dark', name: 'Dark' }],
        defaultModeId: 'mode-dark',
        variableIds: ['color-primary', 'color-secondary'],
      },
    };

    const result = toDtcgTokenSet(variables, collections);

    assert(result.hasOwnProperty('colors'));
    assert(result.colors.hasOwnProperty('primary'));
    assert(result.colors.hasOwnProperty('secondary'));
    assert.deepStrictEqual((result.colors as any).secondary, {
      $value: '{colors.primary}',
      $type: 'string',
      $id: 'color-secondary',
    });
  });

  it('should handle self-referencing alias without infinite loop', () => {
    const variables: Record<string, MockVariable> = {
      'color-self': {
        id: 'color-self',
        name: 'colors/self',
        key: 'color-self',
        resolvedType: 'VARIABLE_ALIAS',
        valuesByMode: {
          'mode-dark': 'color-self', // Self-reference
        },
        variableCollectionId: 'collection-1',
        scopes: [],
        description: 'Self-referencing color',
        hiddenFromPublishing: false,
      },
    };

    const collections: Record<string, MockCollection> = {
      'collection-1': {
        id: 'collection-1',
        name: 'Main Collection',
        key: 'collection-1',
        modes: [{ modeId: 'mode-dark', name: 'Dark' }],
        defaultModeId: 'mode-dark',
        variableIds: ['color-self'],
      },
    };

    // Should complete without hanging and return valid DTCG reference
    const result = toDtcgTokenSet(variables, collections);
    assert(result.hasOwnProperty('colors'));
    assert(result.colors.hasOwnProperty('self'));
    // Self-reference should return valid DTCG reference (not crash)
    assert.strictEqual((result.colors as any).self.$value, '{colors.self}');
  });

  it('should handle cyclic alias without infinite loop', () => {
    const variables: Record<string, MockVariable> = {
      'color-a': {
        id: 'color-a',
        name: 'colors/a',
        key: 'color-a',
        resolvedType: 'VARIABLE_ALIAS',
        valuesByMode: {
          'mode-dark': 'color-b', // Points to B
        },
        variableCollectionId: 'collection-1',
        scopes: [],
        description: 'Color A',
        hiddenFromPublishing: false,
      },
      'color-b': {
        id: 'color-b',
        name: 'colors/b',
        key: 'color-b',
        resolvedType: 'VARIABLE_ALIAS',
        valuesByMode: {
          'mode-dark': 'color-a', // Points back to A - cycle!
        },
        variableCollectionId: 'collection-1',
        scopes: [],
        description: 'Color B',
        hiddenFromPublishing: false,
      },
    };

    const collections: Record<string, MockCollection> = {
      'collection-1': {
        id: 'collection-1',
        name: 'Main Collection',
        key: 'collection-1',
        modes: [{ modeId: 'mode-dark', name: 'Dark' }],
        defaultModeId: 'mode-dark',
        variableIds: ['color-a', 'color-b'],
      },
    };

    // Should complete without hanging and return valid DTCG references
    const result = toDtcgTokenSet(variables, collections);
    assert(result.hasOwnProperty('colors'));
    // Both should have valid references (not crash)
    assert.strictEqual((result.colors as any).a.$value, '{colors.b}');
    assert.strictEqual((result.colors as any).b.$value, '{colors.a}');
  });

  it('should handle empty input', () => {
    const result = toDtcgTokenSet({}, {});
    assert.deepStrictEqual(result, {});
  });

  it('should handle token/group collision with _self pattern', () => {
    // Test case: 'a' (token) and 'a/b' (token) both exist
    // The token 'a' should be moved to _self child
    const variables: Record<string, MockVariable> = {
      'var-a': {
        id: 'var-a',
        name: 'a',
        key: 'var-a',
        resolvedType: 'STRING',
        valuesByMode: { 'mode-1': 'token-a-value' },
        variableCollectionId: 'collection-1',
        scopes: [],
        description: 'Token at path a',
        hiddenFromPublishing: false,
      },
      'var-ab': {
        id: 'var-ab',
        name: 'a/b',
        key: 'var-ab',
        resolvedType: 'STRING',
        valuesByMode: { 'mode-1': 'token-ab-value' },
        variableCollectionId: 'collection-1',
        scopes: [],
        description: 'Token at path a/b',
        hiddenFromPublishing: false,
      },
    };

    const collections: Record<string, MockCollection> = {
      'collection-1': {
        id: 'collection-1',
        name: 'Main Collection',
        key: 'collection-1',
        modes: [{ modeId: 'mode-1', name: 'Mode 1' }],
        defaultModeId: 'mode-1',
        variableIds: ['var-a', 'var-ab'],
      },
    };

    const result = toDtcgTokenSet(variables, collections);

    // 'a' should be moved to _self, and 'b' should be a child
    assert.ok(result.a, 'Group a should exist');
    assert.ok((result.a as any)._self, 'Token a should be moved to _self');
    assert.strictEqual((result.a as any)._self.$value, 'token-a-value');
    assert.ok((result.a as any).b, 'Child b should exist');
    assert.strictEqual(((result.a as any).b as any).$value, 'token-ab-value');
  });

  it('should handle unknown resolvedType', () => {
    const variables: Record<string, MockVariable> = {
      'unknown-type': {
        id: 'unknown-type',
        name: 'unknown/type',
        key: 'unknown-type',
        resolvedType: 'UNKNOWN',
        valuesByMode: {
          'mode-default': 'value',
        },
        variableCollectionId: 'collection-1',
        scopes: [],
        description: 'Unknown type',
        hiddenFromPublishing: false,
      },
    };

    const collections: Record<string, MockCollection> = {
      'collection-1': {
        id: 'collection-1',
        name: 'Main Collection',
        key: 'collection-1',
        modes: [{ modeId: 'mode-default', name: 'Default' }],
        defaultModeId: 'mode-default',
        variableIds: ['unknown-type'],
      },
    };

    const result = toDtcgTokenSet(variables, collections);

    assert(result.hasOwnProperty('unknown'));
    assert(result.unknown.hasOwnProperty('type'));
    assert.deepStrictEqual((result.unknown as any).type, {
      $value: 'value',
      $type: 'string',
      $id: 'unknown-type',
    });
  });

  it('should handle variable without matching collection (orphan)', () => {
    const variables: Record<string, MockVariable> = {
      'orphan-var': {
        id: 'orphan-var',
        name: 'orphan/variable',
        key: 'orphan-var',
        resolvedType: 'FLOAT',
        valuesByMode: {
          'mode-default': 42,
        },
        variableCollectionId: 'non-existent-collection',
        scopes: [],
        description: 'Orphan variable',
        hiddenFromPublishing: false,
      },
    };

    const collections: Record<string, MockCollection> = {};

    const result = toDtcgTokenSet(variables, collections);

    // Should still transform with fallback to first available mode
    assert(result.hasOwnProperty('orphan'));
    assert(result.orphan.hasOwnProperty('variable'));
    assert.deepStrictEqual((result.orphan as any).variable, {
      $value: 42,
      $type: 'number',
      $id: 'orphan-var',
    });
  });

  it('should trim leading/trailing slashes from variable name', () => {
    const variables: Record<string, MockVariable> = {
      'slash-var': {
        id: 'slash-var',
        name: '/colors/primary/',
        key: 'slash-var',
        resolvedType: 'COLOR',
        valuesByMode: {
          'mode-default': { r: 1, g: 0, b: 0, a: 1 },
        },
        variableCollectionId: 'collection-1',
        scopes: [],
        description: 'Slash variable',
        hiddenFromPublishing: false,
      },
    };

    const collections: Record<string, MockCollection> = {
      'collection-1': {
        id: 'collection-1',
        name: 'Main Collection',
        key: 'collection-1',
        modes: [{ modeId: 'mode-default', name: 'Default' }],
        defaultModeId: 'mode-default',
        variableIds: ['slash-var'],
      },
    };

    const result = toDtcgTokenSet(variables, collections);

    // Should trim and create correct nested structure
    assert(result.hasOwnProperty('colors'));
    assert((result.colors as any).hasOwnProperty('primary'));
    assert.deepStrictEqual((result.colors as any).primary, {
      $value: '#FF0000',
      $type: 'color',
      $id: 'slash-var',
    });
  });
});

describe('figmaColorToHexDtcg', () => {
  it('should clamp color values outside [0, 1] range', () => {
    // Values outside [0, 1] should be clamped
    const result = figmaColorToHexDtcg({ r: 1.5, g: -0.5, b: 0.5, a: 1 });
    assert.strictEqual(result, '#FF0080');
  });

  it('should handle alpha channel correctly', () => {
    const opaque = figmaColorToHexDtcg({ r: 1, g: 0, b: 0, a: 1 });
    assert.strictEqual(opaque, '#FF0000');

    const transparent = figmaColorToHexDtcg({ r: 1, g: 0, b: 0, a: 0.5 });
    assert.strictEqual(transparent, '#FF000080');
  });
});
