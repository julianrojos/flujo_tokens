/**
 * Token Export Handler Tests
 *
 * Tests for handleExportTokens with CSS/Tailwind/TypeScript emitters.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handleExportTokens } from '../handlers/token-export';

function setMockFigma(figma: unknown): void {
  (globalThis as unknown as { figma?: unknown }).figma = figma;
}

function clearMockFigma(): void {
  delete (globalThis as unknown as { figma?: unknown }).figma;
}

describe('handleExportTokens', () => {
  afterEach(() => {
    clearMockFigma();
  });

  it('should export CSS with -- prefixed variables in :root', async () => {
    setMockFigma({
      variables: {
        getLocalVariablesAsync: async () => [
          {
            id: 'var-1',
            name: 'colors/primary',
            key: 'key-1',
            resolvedType: 'COLOR',
            valuesByMode: { 'mode-1': { r: 1, g: 0, b: 0, a: 1 } },
            variableCollectionId: 'col-1',
            scopes: [],
            description: '',
            hiddenFromPublishing: false,
            remote: false,
          },
        ],
        getLocalVariableCollectionsAsync: async () => [
          {
            id: 'col-1',
            name: 'Colors',
            key: 'col-1',
            modes: [{ modeId: 'mode-1', name: 'Default' }],
            defaultModeId: 'mode-1',
            variableIds: ['var-1'],
          },
        ],
      },
    });

    const result = await handleExportTokens({ format: 'css' });

    expect(result.success).toBe(true);
    expect(result.format).toBe('css');
    expect(result.content).toContain(':root');
    expect(result.content).toContain('--colors-primary');
    expect(result.content.toLowerCase()).toContain('#ff0000');
    expect(result.stats.variableCount).toBe(1);
  });

  it('should export Tailwind with valid JS structure', async () => {
    setMockFigma({
      variables: {
        getLocalVariablesAsync: async () => [
          {
            id: 'var-1',
            name: 'spacing/small',
            key: 'key-1',
            resolvedType: 'FLOAT',
            valuesByMode: { 'mode-1': 8 },
            variableCollectionId: 'col-1',
            scopes: [],
            description: '',
            hiddenFromPublishing: false,
            remote: false,
          },
        ],
        getLocalVariableCollectionsAsync: async () => [
          {
            id: 'col-1',
            name: 'Spacing',
            key: 'col-1',
            modes: [{ modeId: 'mode-1', name: 'Default' }],
            defaultModeId: 'mode-1',
            variableIds: ['var-1'],
          },
        ],
      },
    });

    const result = await handleExportTokens({ format: 'tailwind' });

    expect(result.success).toBe(true);
    expect(result.format).toBe('tailwind');
    expect(result.content).toContain('module.exports');
    expect(result.content).toContain('theme');
    expect(result.content).toContain('extend');
  });

  it('should export TypeScript with as const', async () => {
    setMockFigma({
      variables: {
        getLocalVariablesAsync: async () => [
          {
            id: 'var-1',
            name: 'colors/primary',
            key: 'key-1',
            resolvedType: 'COLOR',
            valuesByMode: { 'mode-1': { r: 0, g: 0, b: 1, a: 1 } },
            variableCollectionId: 'col-1',
            scopes: [],
            description: '',
            hiddenFromPublishing: false,
            remote: false,
          },
        ],
        getLocalVariableCollectionsAsync: async () => [
          {
            id: 'col-1',
            name: 'Colors',
            key: 'col-1',
            modes: [{ modeId: 'mode-1', name: 'Default' }],
            defaultModeId: 'mode-1',
            variableIds: ['var-1'],
          },
        ],
      },
    });

    const result = await handleExportTokens({ format: 'typescript' });

    expect(result.success).toBe(true);
    expect(result.format).toBe('typescript');
    expect(result.content).toContain('export const');
    expect(result.content).toContain('as const');
  });

  it('should handle empty collection (no variables)', async () => {
    setMockFigma({
      variables: {
        getLocalVariablesAsync: async () => [],
        getLocalVariableCollectionsAsync: async () => [
          {
            id: 'col-1',
            name: 'Empty',
            key: 'col-1',
            modes: [{ modeId: 'mode-1', name: 'Default' }],
            defaultModeId: 'mode-1',
            variableIds: [],
          },
        ],
      },
    });

    const result = await handleExportTokens({ format: 'css', collection: 'Empty' });

    expect(result.success).toBe(true);
    expect(result.format).toBe('css');
    expect(result.content).toBe('');
    expect(result.stats.variableCount).toBe(0);
  });

  it('should filter by collection name', async () => {
    setMockFigma({
      variables: {
        getLocalVariablesAsync: async () => [
          {
            id: 'var-1',
            name: 'colors/primary',
            key: 'key-1',
            resolvedType: 'COLOR',
            valuesByMode: { 'mode-1': { r: 1, g: 0, b: 0, a: 1 } },
            variableCollectionId: 'col-1',
            scopes: [],
            description: '',
            hiddenFromPublishing: false,
            remote: false,
          },
          {
            id: 'var-2',
            name: 'spacing/small',
            key: 'key-2',
            resolvedType: 'FLOAT',
            valuesByMode: { 'mode-1': 8 },
            variableCollectionId: 'col-2',
            scopes: [],
            description: '',
            hiddenFromPublishing: false,
            remote: false,
          },
        ],
        getLocalVariableCollectionsAsync: async () => [
          {
            id: 'col-1',
            name: 'Colors',
            key: 'col-1',
            modes: [{ modeId: 'mode-1', name: 'Default' }],
            defaultModeId: 'mode-1',
            variableIds: ['var-1'],
          },
          {
            id: 'col-2',
            name: 'Spacing',
            key: 'col-2',
            modes: [{ modeId: 'mode-1', name: 'Default' }],
            defaultModeId: 'mode-1',
            variableIds: ['var-2'],
          },
        ],
      },
    });

    const result = await handleExportTokens({ format: 'css', collection: 'Colors' });

    expect(result.success).toBe(true);
    expect(result.stats.variableCount).toBe(1);
    expect(result.content).toContain('--colors-primary');
    expect(result.content).not.toContain('--spacing-small');
  });
});
