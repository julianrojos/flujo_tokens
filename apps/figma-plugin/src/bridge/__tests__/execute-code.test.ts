/**
 * Execute code handler tests
 */

import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../protocol';
import { handleExecuteCode } from '../handlers/execute-code';

function setMockFigma(figma: unknown): void {
  (globalThis as unknown as { figma?: unknown }).figma = figma;
}

function clearMockFigma(): void {
  delete (globalThis as unknown as { figma?: unknown }).figma;
}

afterEach(() => {
  clearMockFigma();
});

describe('handleExecuteCode', () => {
  it('returns success for valid code', async () => {
    setMockFigma({
      root: { name: 'Test file' },
      fileKey: 'test-key',
    });

    const result = await handleExecuteCode({
      code: 'return { ok: true, value: 42 };',
      timeout: 500,
    });

    expect(result.success).toBe(true);
    expect(result.result).toEqual({ ok: true, value: 42 });
  });

  it('throws TIMEOUT when code exceeds timeout', async () => {
    setMockFigma({
      root: { name: 'Test file' },
      fileKey: 'test-key',
    });

    await expect(
      handleExecuteCode({
        code: 'await new Promise((resolve) => setTimeout(resolve, 50)); return 1;',
        timeout: 5,
      })
    ).rejects.toMatchObject({ code: ERROR_CODES.TIMEOUT });
  });
});
