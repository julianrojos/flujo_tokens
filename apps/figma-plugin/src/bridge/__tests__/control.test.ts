import { afterEach, describe, expect, it, vi } from 'vitest';

import { handleReloadUI } from '../handlers/control';

describe('control handlers', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (globalThis as typeof globalThis & { figma?: unknown; __html__?: string }).figma;
    delete (globalThis as typeof globalThis & { figma?: unknown; __html__?: string }).__html__;
  });

  it('handleReloadUI does not throw when figma globals are unavailable', async () => {
    vi.useFakeTimers();
    const result = await handleReloadUI({});

    expect(result).toEqual({ success: true });

    await vi.runAllTimersAsync();
  });
});
