import { describe, expect, it } from 'vitest';

import {
  DEFAULT_API_BASE_URL,
  DEFAULT_DIRECT_WS_URL,
  resolveFigmaPluginRuntimeConfig,
} from './runtime-config';

describe('resolveFigmaPluginRuntimeConfig', () => {
  it('falls back to local defaults', () => {
    expect(resolveFigmaPluginRuntimeConfig()).toEqual({
      apiBaseUrl: DEFAULT_API_BASE_URL,
      directWsUrl: DEFAULT_DIRECT_WS_URL,
    });
  });

  it('derives the websocket url from the api base when only VITE_API_URL is set', () => {
    expect(
      resolveFigmaPluginRuntimeConfig({
        env: {
          VITE_API_URL: 'https://dashboard.example/',
        },
      }),
    ).toEqual({
      apiBaseUrl: 'https://dashboard.example',
      directWsUrl: 'wss://dashboard.example/ws/figma-plugin',
    });
  });

  it('prefers explicit websocket overrides', () => {
    expect(
      resolveFigmaPluginRuntimeConfig({
        env: {
          VITE_API_URL: 'https://dashboard.example',
          VITE_DIRECT_WS_URL: 'wss://socket.example/ws/figma-plugin',
        },
      }),
    ).toEqual({
      apiBaseUrl: 'https://dashboard.example',
      directWsUrl: 'wss://socket.example/ws/figma-plugin',
    });
  });

  it('prefers global config over env values', () => {
    expect(
      resolveFigmaPluginRuntimeConfig({
        env: {
          VITE_API_URL: 'https://dashboard.example',
          VITE_DIRECT_WS_URL: 'wss://socket.example/ws/figma-plugin',
        },
        globalConfig: {
          apiBaseUrl: 'https://override.example/',
          directWsUrl: 'wss://override.example/ws/figma-plugin',
        },
      }),
    ).toEqual({
      apiBaseUrl: 'https://override.example',
      directWsUrl: 'wss://override.example/ws/figma-plugin',
    });
  });
});
