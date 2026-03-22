import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  compressVariables,
  compressStyles,
  resolveCompressionLevel,
  compressKitResult,
  estimateJsonSize,
} from './response-compressor.js';
import type { VariableData, VariableCollectionData } from '../services/figma-direct-bridge-service.ts';

// Alias for clarity in tests
type MockVariable = VariableData;
type MockCollection = VariableCollectionData;

type MockStyle = {
  id: string;
  name: string;
  styleType: string;
  key: string;
  description: string;
};

type MockKitResult = {
  tokens?: {
    variables: Record<string, MockVariable>;
    variableCollections: Record<string, MockCollection>;
  };
  styles?: MockStyle[];
};

// Test cases
describe('compressVariables', () => {
  const collections: Record<string, MockCollection> = {
    col1: {
      id: 'col1',
      name: 'Collection 1',
      key: 'col1',
      modes: [{ modeId: 'mode1', name: 'Mode 1' }],
      defaultModeId: 'mode1',
      variableIds: ['var1', 'var2'],
    },
  };

  const variables: Record<string, MockVariable> = {
    var1: {
      id: 'var1',
      name: 'Variable 1',
      key: 'var1',
      resolvedType: 'COLOR',
      valuesByMode: {
        mode1: { r: 0.1, g: 0.2, b: 0.3, a: 1 },
        mode2: { r: 0.4, g: 0.5, b: 0.6, a: 1 },
      },
      variableCollectionId: 'col1',
      scopes: [],
      description: 'Test variable 1',
      hiddenFromPublishing: false,
    },
    var2: {
      id: 'var2',
      name: 'Variable 2',
      key: 'var2',
      resolvedType: 'FLOAT',
      valuesByMode: {
        mode1: 10,
        mode2: 20,
      },
      variableCollectionId: 'col1',
      scopes: [],
      description: 'Test variable 2',
      hiddenFromPublishing: false,
    },
  };

  it('should return full variables at full level', () => {
    const result = compressVariables(variables, 'full', collections);
    assert.deepStrictEqual(result, variables);
  });

  it('should return summary variables at summary level', () => {
    const result = compressVariables(variables, 'summary', collections);
    assert.strictEqual(Object.keys(result).length, 2);
    // Type guard: summary variables have valuesByMode
    const var1 = result.var1 as { valuesByMode: Record<string, unknown> };
    const var2 = result.var2 as { valuesByMode: Record<string, unknown> };
    assert.deepStrictEqual(var1.valuesByMode, { mode1: { r: 0.1, g: 0.2, b: 0.3, a: 1 } });
    assert.deepStrictEqual(var2.valuesByMode, { mode1: 10 });
  });

  it('should return compact variables at compact level', () => {
    const result = compressVariables(variables, 'compact', collections);
    assert.strictEqual(Object.keys(result).length, 2);
    // Compact: only id, name, resolvedType (no valuesByMode at all)
    assert.deepStrictEqual(result.var1, {
      id: 'var1',
      name: 'Variable 1',
      resolvedType: 'COLOR',
    });
    // Compact: only id, name, resolvedType (no valuesByMode at all)
    assert.deepStrictEqual(result.var2, {
      id: 'var2',
      name: 'Variable 2',
      resolvedType: 'FLOAT',
    });
  });
});

describe('compressStyles', () => {
  const styles: MockStyle[] = [
    {
      id: 'style1',
      name: 'Style 1',
      styleType: 'FILL',
      key: 'style1',
      description: 'Test style 1',
    },
    {
      id: 'style2',
      name: 'Style 2',
      styleType: 'TEXT',
      key: 'style2',
      description: 'Test style 2',
    },
  ];

  it('should return full styles at full level', () => {
    const result = compressStyles(styles, 'full');
    assert.deepStrictEqual(result, styles);
  });

  it('should return summary styles at summary level', () => {
    const result = compressStyles(styles, 'summary');
    assert.strictEqual(result.length, 2);
    // Summary: no description
    assert.deepStrictEqual(result[0], {
      id: 'style1',
      name: 'Style 1',
      styleType: 'FILL',
      key: 'style1',
    });
    assert.deepStrictEqual(result[1], {
      id: 'style2',
      name: 'Style 2',
      styleType: 'TEXT',
      key: 'style2',
    });
  });

  it('should return compact styles at compact level', () => {
    const result = compressStyles(styles, 'compact');
    assert.strictEqual(result.length, 2);
    assert.deepStrictEqual(result[0], {
      id: 'style1',
      name: 'Style 1',
      styleType: 'FILL',
      key: 'style1',
    });
    assert.deepStrictEqual(result[1], {
      id: 'style2',
      name: 'Style 2',
      styleType: 'TEXT',
      key: 'style2',
    });
  });
});

describe('resolveCompressionLevel', () => {
  it('should return explicit level for full/summary/compact', () => {
    assert.strictEqual(resolveCompressionLevel('full', 1000), 'full');
    assert.strictEqual(resolveCompressionLevel('summary', 1000), 'summary');
    assert.strictEqual(resolveCompressionLevel('compact', 1000), 'compact');
  });

  it('should auto-degrade based on size', () => {
    assert.strictEqual(resolveCompressionLevel('auto', 100), 'full');
    assert.strictEqual(resolveCompressionLevel('auto', 600_000), 'summary');
    assert.strictEqual(resolveCompressionLevel('auto', 1_100_000), 'compact');
  });

  it('should handle dtcg format', () => {
    assert.strictEqual(resolveCompressionLevel('dtcg', 1000), 'full');
  });
});

describe('compressKitResult', () => {
  const collections: Record<string, MockCollection> = {
    col1: {
      id: 'col1',
      name: 'Collection 1',
      key: 'col1',
      modes: [{ modeId: 'mode1', name: 'Mode 1' }],
      defaultModeId: 'mode1',
      variableIds: ['var1', 'var2'],
    },
  };

  const kitResult: MockKitResult = {
    tokens: {
      variables: {
        var1: {
          id: 'var1',
          name: 'Variable 1',
          key: 'var1',
          resolvedType: 'COLOR',
          valuesByMode: {
            mode1: { r: 0.1, g: 0.2, b: 0.3, a: 1 },
            mode2: { r: 0.4, g: 0.5, b: 0.6, a: 1 },
          },
          variableCollectionId: 'col1',
          scopes: [],
          description: 'Test variable 1',
          hiddenFromPublishing: false,
        },
        var2: {
          id: 'var2',
          name: 'Variable 2',
          key: 'var2',
          resolvedType: 'FLOAT',
          valuesByMode: {
            mode1: 10,
            mode2: 20,
          },
          variableCollectionId: 'col1',
          scopes: [],
          description: 'Test variable 2',
          hiddenFromPublishing: false,
        },
      },
      variableCollections: collections,
    },
    styles: [
      {
        id: 'style1',
        name: 'Style 1',
        styleType: 'FILL',
        key: 'style1',
        description: 'Test style 1',
      },
      {
        id: 'style2',
        name: 'Style 2',
        styleType: 'TEXT',
        key: 'style2',
        description: 'Test style 2',
      },
    ],
  };

  it('should compress variables and styles at full level', () => {
    const result = compressKitResult(kitResult as any, 'full', collections);
    assert.deepStrictEqual(result.tokens?.variables, kitResult.tokens?.variables);
    assert.deepStrictEqual(result.styles, kitResult.styles);
  });

  it('should compress variables and styles at summary level', () => {
    const result = compressKitResult(kitResult as any, 'summary', collections);
    assert.deepStrictEqual((result.tokens?.variables as any).var1.valuesByMode, { mode1: { r: 0.1, g: 0.2, b: 0.3, a: 1 } });
    assert.deepStrictEqual((result.tokens?.variables as any).var2.valuesByMode, { mode1: 10 });
    // Summary: styles without description
    assert.deepStrictEqual(result.styles?.[0], {
      id: 'style1',
      name: 'Style 1',
      styleType: 'FILL',
      key: 'style1',
    });
  });

  it('should compress variables and styles at compact level', () => {
    const result = compressKitResult(kitResult as any, 'compact', collections);
    // Compact: only id, name, resolvedType (no valuesByMode at all)
    assert.deepStrictEqual(result.tokens?.variables.var1, {
      id: 'var1',
      name: 'Variable 1',
      resolvedType: 'COLOR',
    });
    assert.deepStrictEqual(result.styles?.[0], {
      id: 'style1',
      name: 'Style 1',
      styleType: 'FILL',
      key: 'style1',
    });
  });
});

describe('estimateJsonSize', () => {
  it('should return correct size for simple object', () => {
    const obj = { a: 1, b: 2 };
    assert.strictEqual(estimateJsonSize(obj), JSON.stringify(obj).length);
  });

  it('should return correct size for nested object', () => {
    const obj = { a: { b: 1, c: 2 }, d: 3 };
    assert.strictEqual(estimateJsonSize(obj), JSON.stringify(obj).length);
  });
});
