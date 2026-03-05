/**
 * Command Route Service
 *
 * Builds command configurations for route handlers.
 * Migrated from apps/ds-dashboard/server/lib/command-route-service.mjs
 */

export interface RunScriptCommandArgsOptions {
  scriptName: string;
  systemId: string;
  body: {
    all?: boolean;
    component?: string;
    fromStep?: string;
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
    [key: string]: unknown;
  };
  toBooleanString: (value: unknown, fallback: boolean) => string;
}

export interface SyncFigmaTokensCommandConfigResult {
  commandArgs: string[];
  commandDisplayArgs: string[];
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
  if (scriptName !== 'ds:pipeline') return { args };
  if (body.all) args.push('--all');
  if (body.component) args.push('--component', String(body.component));
  if (body.fromStep) args.push('--from-step', String(body.fromStep));
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

  const commandArgs = [
    '--force',
    force,
    '--merge',
    merge,
    '--compile',
    compile,
    '--dry-run',
    dryRun,
  ];
  if (figmaUrl) commandArgs.push('--url', figmaUrl);
  const commandEnv = figmaToken ? { FIGMA_TOKEN: figmaToken } : undefined;

  return {
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
  const includeVariants = toBooleanString(body.includeVariants, true);
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
