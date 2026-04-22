/**
 * Command Route Service
 *
 * Builds command configurations for route handlers.
 * Migrated from apps/ds-dashboard/server/lib/command-route-service.mjs
 */
import * as dsTypes from 'ds-types';

// NOTE: Under the current tsx runtime this package is exposed through a default export object.
// We use (dsTypes as any).default ?? dsTypes as fallback to handle both:
// - TypeScript compilation (named exports from source)
// - Runtime execution (default export object from tsx bundling)
const {
  InvalidFigmaVariableSourceError,
  parseFigmaVariableSource,
} = (dsTypes as any).default ?? dsTypes as {
  InvalidFigmaVariableSourceError: new (...args: any[]) => Error;
  parseFigmaVariableSource: (
    rawValue: unknown,
    options?: { defaultValue?: 'auto' | 'mcp' | 'rest'; optionName?: string },
  ) => 'auto' | 'mcp' | 'rest';
};

export interface RunScriptCommandArgsOptions {
  scriptName: string;
  systemId: string;
  body: Record<string, unknown>;
}

export interface RunScriptCommandArgsResult {
  args: string[];
}

type CommandConfigError = {
  ok: false;
  errorArgs: {
    code: string;
    userMessage: string;
    recoverable: boolean;
    context?: Record<string, unknown>;
  };
};

export interface CaptureFigmaScreenshotCommandConfigOptions {
  body: {
    figmaUrl?: string;
    url?: string;
    figmaToken?: string;
    componentSlug?: string;
    includeVariants?: boolean;
    continueOnError?: boolean;
    refreshIndices?: boolean;
    dryRun?: boolean;
    variantLimit?: number;
    scale?: number;
    format?: string;
    mainCaptureMode?: string;
    componentKind?: string;
    tokensSource?: string;
    tokens_source?: string;
    ['tokens-source']?: string;
    [key: string]: unknown;
  };
  toBooleanString: (value: unknown, fallback: boolean) => string;
  toNumberString: (value: unknown, fallback: number, max: number) => string;
}

type CaptureFigmaScreenshotCommandConfigSuccess = {
  ok: true;
  commandArgs: string[];
  commandDisplayArgs: string[];
  commandEnv?: Record<string, string>;
};

export type CaptureFigmaScreenshotCommandConfigResult =
  | CaptureFigmaScreenshotCommandConfigSuccess
  | CommandConfigError;

function toTrimmed(value: unknown): string {
  return String(value || '').trim();
}

function toLowerTrimmed(value: unknown): string {
  return toTrimmed(value).toLowerCase();
}

export function isInvalidTokensSourceError(error: unknown): boolean {
  return error instanceof InvalidFigmaVariableSourceError;
}

function normalizeTokensSource(rawValue: unknown): 'auto' | 'mcp' | 'rest' {
  return parseFigmaVariableSource(rawValue, {
    defaultValue: 'mcp',
    optionName: 'tokens-source',
  });
}

function redactFigmaToken(args: string[]): string[] {
  const commandDisplayArgs = [...args];
  const tokenIdx = commandDisplayArgs.indexOf('--figma-token');
  if (tokenIdx >= 0 && tokenIdx + 1 < commandDisplayArgs.length) {
    commandDisplayArgs[tokenIdx + 1] = '***redacted***';
  }
  return commandDisplayArgs;
}

/**
 * Build command args for running a script.
 */
export function buildRunScriptCommandArgs(options: RunScriptCommandArgsOptions): RunScriptCommandArgsResult {
  const { scriptName, body, systemId } = options;
  const args = ['run', scriptName, '--', '--system', systemId];
  void body;
  return { args };
}

/**
 * Build command config for capturing Figma screenshot.
 */
export function buildCaptureFigmaScreenshotCommandConfig(
  options: CaptureFigmaScreenshotCommandConfigOptions
): CaptureFigmaScreenshotCommandConfigResult {
  const { body, toBooleanString, toNumberString } = options;

  const figmaUrl = toTrimmed(body.figmaUrl ?? body.url);
  if (!figmaUrl) {
    return {
      ok: false,
      errorArgs: {
        code: 'validation.figma_url_required',
        userMessage: 'figmaUrl is required in request body.',
        recoverable: true,
        context: { field: 'figmaUrl' },
      },
    };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(figmaUrl);
  } catch {
    return {
      ok: false,
      errorArgs: {
        code: 'validation.invalid_figma_url',
        userMessage: 'Invalid figmaUrl.',
        recoverable: true,
        context: { figmaUrl },
      },
    };
  }

  const host = toLowerTrimmed(parsedUrl.hostname);
  if (host !== 'figma.com' && !host.endsWith('.figma.com')) {
    return {
      ok: false,
      errorArgs: {
        code: 'validation.invalid_figma_host',
        userMessage: `URL host is not figma.com: ${host}`,
        recoverable: true,
        context: { host, figmaUrl },
      },
    };
  }

  const componentSlug = toLowerTrimmed(body.componentSlug);
  const figmaToken = toTrimmed(body.figmaToken);
  const includeVariants = toBooleanString(body.includeVariants, false);
  const continueOnError = toBooleanString(body.continueOnError, true);
  const refreshIndices = toBooleanString(body.refreshIndices, false);
  const dryRun = toBooleanString(body.dryRun, false);
  const variantLimit = toNumberString(body.variantLimit, 6, 20);
  const scale = toNumberString(body.scale, 2, 4);
  const format = toLowerTrimmed(body.format ?? 'png') || 'png';
  const mainCaptureMode = toLowerTrimmed(body.mainCaptureMode ?? 'rest') || 'rest';
  const componentKind = toLowerTrimmed(body.componentKind ?? 'component_set') || 'component_set';
  let tokensSource: 'auto' | 'mcp' | 'rest';
  try {
    tokensSource = normalizeTokensSource(
      body.tokensSource ?? body.tokens_source ?? body['tokens-source'],
    );
  } catch (error) {
    if (isInvalidTokensSourceError(error)) {
      return {
        ok: false,
        errorArgs: {
          code: 'validation.invalid_tokens_source',
          userMessage: error instanceof Error ? error.message : String(error),
          recoverable: true,
          context: { field: 'tokensSource' },
        },
      };
    }
    throw error;
  }

  const commandArgs = [
    '--url',
    figmaUrl,
    '--include-variants',
    includeVariants,
    '--variant-limit',
    variantLimit,
    '--continue-on-error',
    continueOnError,
    '--refresh-indices',
    refreshIndices,
    '--dry-run',
    dryRun,
    '--scale',
    scale,
    '--format',
    format,
    '--main-capture-mode',
    mainCaptureMode,
    '--tokens-source',
    tokensSource,
    '--component-kind',
    componentKind,
    '--skip-db-persistence',
    'true',
  ];
  if (componentSlug) commandArgs.push('--component-slug', componentSlug);
  const commandEnv = figmaToken ? { FIGMA_TOKEN: figmaToken } : undefined;

  return {
    ok: true,
    commandArgs,
    commandDisplayArgs: redactFigmaToken(commandArgs),
    commandEnv,
  };
}
