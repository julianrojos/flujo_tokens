/**
 * Style handler tests
 */

import { afterEach, describe, expect, it } from 'vitest';
import { handleGetLocalStyles } from '../handlers/styles';

function setMockFigma(figma: unknown): void {
  (globalThis as unknown as { figma?: unknown }).figma = figma;
}

function clearMockFigma(): void {
  delete (globalThis as unknown as { figma?: unknown }).figma;
}

afterEach(() => {
  clearMockFigma();
});

describe('styles handlers', () => {
  it('serializes local styles with the expected styleType values', async () => {
    setMockFigma({
      fileKey: 'file-key',
      getLocalPaintStyles: () => [
        { id: 'paint-1', name: 'Brand / Primary', description: 'Paint', key: 'paint-key' },
      ],
      getLocalTextStyles: () => [
        { id: 'text-1', name: 'Body / Small', description: '', key: 'text-key' },
      ],
      getLocalEffectStyles: () => [
        { id: 'effect-1', name: 'Shadow / Card', description: 'Shadow', key: 'effect-key' },
      ],
      getLocalGridStyles: () => [
        { id: 'grid-1', name: 'Layout / 8pt', description: null, key: 'grid-key' },
      ],
    });

    const result = await handleGetLocalStyles({});
    const typed = result as {
      success: boolean;
      fileKey: string | null;
      styles: Array<{ id: string; styleType: string; description: string }>;
    };

    expect(typed.success).toBe(true);
    expect(typed.fileKey).toBe('file-key');
    expect(typed.styles).toHaveLength(4);
    expect(typed.styles.map((style) => style.styleType)).toEqual(['PAINT', 'TEXT', 'EFFECT', 'GRID']);
    expect(typed.styles[1]?.description).toBe('');
    expect(typed.styles[3]?.description).toBe('');
  });
});
