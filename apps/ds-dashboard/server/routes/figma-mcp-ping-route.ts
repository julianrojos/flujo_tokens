/**
 * Figma MCP Ping Route
 *
 * Handles ping requests to the Figma MCP service.
 */

import type { Context } from 'hono';
import { resolveEnvRef } from '../lib/env-ref-utils.ts';
import { pingFigmaMcpService, type FigmaMcpPingServiceResult } from '../services/figma-mcp-ping-service.ts';

interface ParsedFigmaUrl {
  ok: boolean;
  hostValid: boolean;
}

interface NormalizedMcpPayload {
  ok: boolean;
  connected: boolean;
  code?: string;
  message: string;
  collectionsDetected?: number;
  variablesDetected?: number;
  everConnected: boolean;
}

export interface FigmaMcpPingRouteDeps {
  failJson: (
    c: Context,
    statusCode: number,
    args: { code: string; userMessage: string; recoverable: boolean }
  ) => Response | Promise<Response>;
  readJsonBody: (c: Context) => Promise<Record<string, unknown>>;
  pingFigmaMcpFn?: (args: {
    figmaUrl?: string;
    figmaToken?: string;
  }) => Promise<FigmaMcpPingServiceResult>;
}

function parseFigmaUrl(figmaUrl: string): ParsedFigmaUrl {
  try {
    const parsed = new URL(figmaUrl);
    const host = String(parsed.hostname || '').trim().toLowerCase();
    const hostValid = host === 'figma.com' || host.endsWith('.figma.com');
    return { ok: true, hostValid };
  } catch {
    return { ok: false, hostValid: false };
  }
}

function normalizeMcpPayload(payload: unknown): NormalizedMcpPayload | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const p = payload as Record<string, unknown>;
  return {
    ok: p['ok'] !== false,
    connected: p['connected'] === true,
    code: typeof p['code'] === 'string' ? p['code'] : undefined,
    message: typeof p['message'] === 'string' ? p['message'] : '',
    collectionsDetected: typeof p['collectionsDetected'] === 'number' ? p['collectionsDetected'] : undefined,
    variablesDetected: typeof p['variablesDetected'] === 'number' ? p['variablesDetected'] : undefined,
    everConnected: typeof p['everConnected'] === 'boolean' ? p['everConnected'] : false,
  };
}

export async function handleFigmaMcpPingRoute(c: Context, deps: FigmaMcpPingRouteDeps): Promise<Response> {
  const { failJson, readJsonBody } = deps;
  const body = await readJsonBody(c);

  const figmaUrl = String(body.figmaUrl || '').trim();
  const figmaTokenRaw = String(body.figmaToken || '').trim();
  const resolvedFigmaToken = figmaTokenRaw ? resolveEnvRef(figmaTokenRaw) : '';

  if (figmaTokenRaw && !resolvedFigmaToken) {
    return c.json(
      {
        ok: false,
        connected: false,
        code: 'mcp_ping.env_var_not_set',
        message: 'The environment variable referenced by figmaToken is not set on the server.',
      },
      200,
    );
  }

  if (figmaUrl) {
    const parsedUrl = parseFigmaUrl(figmaUrl);
    if (!parsedUrl.ok) {
      return failJson(c, 400, {
        code: 'mcp_ping.invalid_url',
        userMessage: 'Invalid Figma URL.',
        recoverable: true,
      });
    }
    if (!parsedUrl.hostValid) {
      return failJson(c, 400, {
        code: 'mcp_ping.invalid_host',
        userMessage: 'URL host must be figma.com.',
        recoverable: true,
      });
    }
  }

  const pingFigmaMcpFn = deps.pingFigmaMcpFn ?? pingFigmaMcpService;
  try {
    const payload = await pingFigmaMcpFn({
      figmaUrl: figmaUrl || undefined,
      figmaToken: resolvedFigmaToken || undefined,
    });
    const normalized = normalizeMcpPayload(payload);
    if (normalized) {
      return c.json(normalized, 200);
    }
    return c.json(
      {
        ok: false,
        connected: false,
        code: 'mcp_ping.invalid_payload',
        message: 'MCP ping returned an invalid payload.',
      },
      200,
    );
  } catch (error) {
    return c.json(
      {
        ok: false,
        connected: false,
        code: 'mcp_ping.command_failed',
        message: error instanceof Error ? error.message : String(error),
      },
      200,
    );
  }
}

export function registerFigmaMcpPingRoute(
  app: { post: (path: string, handler: (c: Context) => Response | Promise<Response>) => void },
  deps: FigmaMcpPingRouteDeps
): void {
  app.post('/api/figma-mcp-ping', (c) => handleFigmaMcpPingRoute(c, deps));
}
