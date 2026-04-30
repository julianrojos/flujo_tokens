/**
 * Runtime configuration helpers for the Figma plugin.
 */

export interface FigmaPluginRuntimeEnv {
  VITE_API_URL?: string;
  VITE_DIRECT_WS_URL?: string;
}

export interface FigmaPluginGlobalConfig {
  apiBaseUrl?: string;
  directWsUrl?: string;
}

export interface ResolvedFigmaPluginRuntimeConfig {
  apiBaseUrl: string;
  directWsUrl: string;
}

export const DEFAULT_API_BASE_URL = 'http://localhost:8787';
/**
 * Default direct WebSocket bridge URL for the plugin runtime.
 * `window.FIGMA_PLUGIN_CONFIG.directWsUrl` can override this at runtime.
 */
export const DEFAULT_DIRECT_WS_URL = 'ws://localhost:8787/ws/figma-plugin';

function normalizeUrl(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\/$/, '') : '';
}

function deriveDirectWsUrl(apiBaseUrl: string): string | null {
  try {
    const parsed = new URL(apiBaseUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }

    parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
    parsed.pathname = '/ws/figma-plugin';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

export function resolveFigmaPluginRuntimeConfig(args?: {
  env?: FigmaPluginRuntimeEnv;
  globalConfig?: FigmaPluginGlobalConfig | null;
}): ResolvedFigmaPluginRuntimeConfig {
  const env = args?.env ?? {};
  const globalConfig = args?.globalConfig ?? null;

  const apiBaseUrl =
    normalizeUrl(globalConfig?.apiBaseUrl) ||
    normalizeUrl(env.VITE_API_URL) ||
    DEFAULT_API_BASE_URL;

  const directWsUrl =
    normalizeUrl(globalConfig?.directWsUrl) ||
    normalizeUrl(env.VITE_DIRECT_WS_URL) ||
    deriveDirectWsUrl(apiBaseUrl) ||
    DEFAULT_DIRECT_WS_URL;

  return {
    apiBaseUrl,
    directWsUrl,
  };
}
