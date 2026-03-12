import { afterEach, describe, expect, it, vi } from 'vitest';
import { getWSRuntime, resetWSRuntime } from '../ws-runtime';

describe('getWSRuntime singleton config guard', () => {
  afterEach(() => {
    resetWSRuntime();
    vi.restoreAllMocks();
  });

  it('returns same singleton when called with equivalent config', () => {
    const first = getWSRuntime({
      transportMode: 'direct',
      directWsUrl: 'ws://localhost:8787/ws/figma-plugin',
    });

    const second = getWSRuntime({
      transportMode: 'direct',
      directWsUrl: 'ws://localhost:8787/ws/figma-plugin',
    });

    expect(second).toBe(first);
  });

  it('throws in non-production when called with different config after initialization', () => {
    getWSRuntime({
      transportMode: 'direct',
      directWsUrl: 'ws://localhost:8787/ws/figma-plugin',
    });

    expect(() =>
      getWSRuntime({
        transportMode: 'direct',
        directWsUrl: 'ws://localhost:9999/ws/figma-plugin',
      }),
    ).toThrow(/Singleton already initialized with different config/);
  });

  it('warns instead of throwing in production', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.NODE_ENV = 'production';

    try {
      getWSRuntime({
        transportMode: 'direct',
        directWsUrl: 'ws://localhost:8787/ws/figma-plugin',
      });

      expect(() =>
        getWSRuntime({
          transportMode: 'direct',
          directWsUrl: 'ws://localhost:9999/ws/figma-plugin',
        }),
      ).not.toThrow();

      expect(warnSpy).toHaveBeenCalledTimes(1);
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });
});
