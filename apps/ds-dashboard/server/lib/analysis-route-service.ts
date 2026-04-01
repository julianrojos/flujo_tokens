/**
 * Analysis Route Service
 *
 * Shared parsing/error helpers for analysis route handlers.
 */

export type ImpactRequestResult =
  | {
    ok: true;
    payload: {
      tokenPath: string;
      newValue: string | null;
      depth?: number;
    };
  }
  | {
    ok: false;
    statusCode: number;
    errorArgs: {
      code: string;
      userMessage: string;
      recoverable: boolean;
      context?: Record<string, unknown>;
    };
  };

export interface SystemContext {
  systemId: string;
  [key: string]: unknown;
}

/**
 * Parse impact request parameters.
 */
export function parseImpactRequest(params: {
  tokenPathRaw: unknown;
  newValueRaw: unknown;
  depthRaw: unknown;
}): ImpactRequestResult {
  const { tokenPathRaw, newValueRaw, depthRaw } = params;

  const tokenPath = String(tokenPathRaw ?? '').trim();
  if (!tokenPath) {
    return {
      ok: false,
      statusCode: 400,
      errorArgs: {
        code: 'validation.token_path_required',
        userMessage: 'tokenPath query param is required.',
        recoverable: true,
        context: { field: 'tokenPath' },
      },
    };
  }

  const newValue = newValueRaw ? String(newValueRaw).trim() : null;
  const depthParsed = depthRaw ? Number.parseInt(String(depthRaw), 10) : Number.NaN;
  const depth = Number.isFinite(depthParsed) ? depthParsed : undefined;
  return {
    ok: true,
    payload: { tokenPath, newValue, depth },
  };
}

/**
 * Build impact failure response.
 */
export function buildImpactFailure(tokenPath: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const normalizedMessage = message.toLowerCase();
  const notFound = normalizedMessage.includes('not found');
  return {
    statusCode: notFound ? 404 : 400,
    errorArgs: {
      code: notFound ? 'impact.token_not_found' : 'impact.invalid_request',
      userMessage: message,
      recoverable: true,
      context: { tokenPath },
    },
  };
}
