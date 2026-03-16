/**
 * Command Route Service
 *
 * Builds command configurations for route handlers.
 * Migrated from apps/ds-dashboard/server/lib/command-route-service.mjs
 */
import dsTypes from 'ds-types';

// NOTE: Under the current tsx runtime this package is exposed through a default export object.
// Keep this destructuring pattern unless ds-types packaging is switched to stable named ESM exports.
const {
  InvalidFigmaVariableSourceError,
  parseFigmaVariableSource,
} = dsTypes as {
  InvalidFigmaVariableSourceError: new (...args: any[]) => Error;
  parseFigmaVariableSource: (
    rawValue: unknown,
    options?: { defaultValue?: 'auto' | 'mcp' | 'rest'; optionName?: string },
  ) => 'auto' | 'mcp' | 'rest';
};

export interface RunScriptCommandArgsOptions {
  scriptName: string;
  systemId: string;
  body: {
    all?: boolean;
    component?: string;
    componentName?: string;
    componentSlug?: string;
    specFile?: string;
    spec_file?: string;
    ['spec-file']?: string;
    fromStep?: string;
    onlyStep?: string;
    dryRun?: boolean;
    [key: string]: unknown;
  };
}

export interface RunScriptCommandArgsResult {
  args: string[];
}

export interface HealthSnapshotCommandConfigOptions {
  body: {
    beforeRef?: string;
    retentionDays?: number;
    skipDiff?: boolean;
    [key: string]: unknown;
  };
  validateGitRef: (value: string) => string | null;
  toBooleanString: (value: unknown, fallback: boolean) => string;
}

export interface HealthSnapshotCommandConfigResult {
  ok: boolean;
  errorArgs?: {
    code: string;
    userMessage: string;
    recoverable: boolean;
    context?: Record<string, unknown>;
  };
  commandLabel?: string;
  scriptArgs?: string[];
}

export interface SyncFigmaTokensCommandConfigOptions {
  body: {
    url?: string;
    figmaUrl?: string;
    figmaToken?: string;
    force?: boolean;
    merge?: boolean;
    compile?: boolean;
    dryRun?: boolean;
    tokensSource?: string;
    tokens_source?: string;
    ['tokens-source']?: string;
    [key: string]: unknown;
  };
  toBooleanString: (value: unknown, fallback: boolean) => string;
}

export interface SyncFigmaTokensCommandConfigResult {
  ok: boolean;
  errorArgs?: {
    code: string;
    userMessage: string;
    recoverable: boolean;
    context?: Record<string, unknown>;
  };
  commandArgs?: string[];
  commandDisplayArgs?: string[];
  commandEnv?: Record<string, string>;
}

export interface CaptureFigmaScreenshotCommandConfigOptions {
  body: {
    figmaUrl?: string;
    url?: string;
    figmaToken?: string;
    componentSlug?: string;
    includeVariants?: boolean;
    requireExistingDoc?: boolean;
    continueOnError?: boolean;
    refreshIndices?: boolean;
    dryRun?: boolean;
    injectDocSpecs?: boolean;
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

export interface CaptureFigmaScreenshotCommandConfigResult {
  ok: boolean;
  errorArgs?: {
    code: string;
    userMessage: string;
    recoverable: boolean;
    context?: Record<string, unknown>;
  };
  commandArgs?: string[];
  commandDisplayArgs?: string[];
  commandEnv?: Record<string, string>;
}

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
  if (scriptName === 'ds:component-doc') {
    const specFile = body.specFile || body.spec_file || body['spec-file'];
    const componentName = body.component || body.componentName || body.componentSlug;
    if (specFile) {
      args.push('--spec-file', String(specFile));
    } else if (componentName) {
      args.push('--component-name', String(componentName));
    }
    return { args };
  }
  if (scriptName !== 'ds:pipeline') return { args };
  if (body.all) args.push('--all');
  if (body.component) args.push('--component', String(body.component));
  if (body.fromStep) args.push('--from-step', String(body.fromStep));
  if (body.onlyStep) args.push('--only-step', String(body.onlyStep));
  if (body.dryRun) args.push('--status-only');
  return { args };
}

/**
 * Build command config for health snapshot.
 */
export function buildHealthSnapshotCommandConfig(
  options: HealthSnapshotCommandConfigOptions
): HealthSnapshotCommandConfigResult {
  const { body, validateGitRef, toBooleanString } = options;

  const beforeRefRaw = toTrimmed(body.beforeRef ?? 'HEAD~1');
  const beforeRef = validateGitRef(beforeRefRaw);
  if (!beforeRef) {
    return {
      ok: false,
      errorArgs: {
        code: 'validation.invalid_git_ref',
        userMessage: 'Invalid beforeRef. Allowed characters: A-Z a-z 0-9 . _ / ~ ^ -',
        recoverable: true,
        context: { beforeRef: beforeRefRaw },
      },
    };
  }

  const retentionDaysRaw = Number(body.retentionDays);
  const retentionDays =
    Number.isFinite(retentionDaysRaw) && retentionDaysRaw > 0 ? String(Math.floor(retentionDaysRaw)) : '120';
  const skipDiff = toBooleanString(body.skipDiff, false);

  return {
    ok: true,
    commandLabel:
      `node tooling/scripts/ds-health-snapshot.mjs --before-ref ${beforeRef} ` +
      `--retention-days ${retentionDays} --skip-diff ${skipDiff}`,
    scriptArgs: [
      '--before-ref',
      beforeRef,
      '--retention-days',
      retentionDays,
      '--skip-diff',
      skipDiff,
      '--format',
      'json',
    ],
  };
}

/**
 * Build command config for syncing Figma tokens.
 */
export function buildSyncFigmaTokensCommandConfig(
  options: SyncFigmaTokensCommandConfigOptions
): SyncFigmaTokensCommandConfigResult {
  const { body, toBooleanString } = options;

  const figmaUrl = toTrimmed(body.url ?? body.figmaUrl);
  const figmaToken = toTrimmed(body.figmaToken);
  const force = toBooleanString(body.force, false);
  const merge = toBooleanString(body.merge, false);
  const compile = toBooleanString(body.compile, true);
  const dryRun = toBooleanString(body.dryRun, true);
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
    '--force',
    force,
    '--merge',
    merge,
    '--compile',
    compile,
    '--dry-run',
    dryRun,
    // Note: tokens-from-figma-runner.ts expects --source (not --tokens-source)
    '--source',
    tokensSource,
  ];
  if (figmaUrl) commandArgs.push('--url', figmaUrl);
  const commandEnv = figmaToken ? { FIGMA_TOKEN: figmaToken } : undefined;

  return {
    ok: true,
    commandArgs,
    commandDisplayArgs: redactFigmaToken(commandArgs),
    commandEnv,
  };
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
  const requireExistingDoc = toBooleanString(body.requireExistingDoc, true);
  const continueOnError = toBooleanString(body.continueOnError, true);
  const refreshIndices = toBooleanString(body.refreshIndices, true);
  const dryRun = toBooleanString(body.dryRun, false);
  const injectDocSpecs = toBooleanString(body.injectDocSpecs, false);
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
    '--require-existing-doc',
    requireExistingDoc,
    '--continue-on-error',
    continueOnError,
    '--refresh-indices',
    refreshIndices,
    '--dry-run',
    dryRun,
    '--inject-doc-specs',
    injectDocSpecs,
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
