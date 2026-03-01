/**
 * Command Route Enqueue Service
 *
 * Builds queue arguments for command route handlers.
 * Migrated from apps/ds-dashboard/server/lib/command-route-enqueue-service.mjs
 */

export interface SystemContext {
  repoRoot: string;
  systemId: string;
  healthSnapshotScriptPath: string;
  tokensFromFigmaScriptPath: string;
  captureFromFigmaUrlScriptPath: string;
}

export interface ParseScriptNameResult {
  ok: boolean;
  scriptName?: string;
  statusCode?: number;
  errorArgs?: {
    code: string;
    userMessage: string;
    recoverable: boolean;
    requestId: string;
  };
}

export interface RefreshScriptQueueArgs {
  repoRoot: string;
  script: string;
  systemId: string;
  requestId: string;
}

export interface RunScriptQueueConfig {
  commandLabel: string;
  queueArgs: {
    label: string;
    systemId: string;
    operationName: string;
    requestId: string;
    inputHash: string;
  };
  runCommand: {
    cwd: string;
    command: string;
    commandArgs: string[];
    commandLabel: string;
  };
}

export interface BuildRunScriptQueueConfigOptions {
  scriptName: string;
  body: Record<string, unknown>;
  sysCtx: SystemContext;
  requestId: string;
  buildRunScriptCommandArgsFn: (options: { scriptName: string; body: Record<string, unknown>; systemId: string }) => { args: string[] };
  sha256TextFn: (value: string) => string;
}

export interface HealthSnapshotQueueArgs {
  repoRoot: string;
  commandLabel: string;
  scriptPath: string;
  systemId: string;
  requestId: string;
  scriptArgs: string[];
}

export interface SyncFigmaTokensQueueArgs {
  repoRoot: string;
  commandLabel: string;
  scriptPath: string;
  systemId: string;
  requestId: string;
  scriptArgs: string[];
  allowNonZeroJson: boolean;
}

export interface CaptureFigmaScreenshotQueueArgs {
  repoRoot: string;
  commandLabel: string;
  scriptPath: string;
  systemId: string;
  requestId: string;
  scriptArgs: string[];
  allowNonZeroJson: boolean;
}

export interface ParsedCommandConfig {
  commandLabel: string;
  scriptArgs: string[];
  commandDisplayArgs: string[];
  commandArgs: string[];
}

/**
 * Parse script name from route parameter.
 */
export function parseScriptNameFromRoute(rawScriptName: unknown, requestId: string): ParseScriptNameResult {
  const scriptName = String(rawScriptName || '').trim();
  if (scriptName) return { ok: true, scriptName };
  return {
    ok: false,
    statusCode: 400,
    errorArgs: {
      code: 'validation.missing_script_name',
      userMessage: 'Missing script name in URL.',
      recoverable: true,
      requestId,
    },
  };
}

/**
 * Build queue args for refresh script job.
 */
export function buildRefreshScriptQueueArgs(options: {
  sysCtx: SystemContext;
  requestId: string;
  script: string;
}): RefreshScriptQueueArgs {
  const { sysCtx, requestId, script } = options;
  return {
    repoRoot: sysCtx.repoRoot,
    script,
    systemId: sysCtx.systemId,
    requestId,
  };
}

/**
 * Build queue config for running a script.
 */
export function buildRunScriptQueueConfig(options: BuildRunScriptQueueConfigOptions): RunScriptQueueConfig {
  const { scriptName, body, sysCtx, requestId, buildRunScriptCommandArgsFn, sha256TextFn } = options;

  const { args } = buildRunScriptCommandArgsFn({
    scriptName,
    body,
    systemId: sysCtx.systemId,
  });

  const commandLabel = `npm ${args.join(' ')}`;
  return {
    commandLabel,
    queueArgs: {
      label: commandLabel,
      systemId: sysCtx.systemId,
      operationName: `run:${scriptName}`,
      requestId,
      inputHash: sha256TextFn(
        JSON.stringify({
          command: 'npm',
          args,
          cwd: sysCtx.repoRoot,
          systemId: sysCtx.systemId,
          scriptName,
        })
      ),
    },
    runCommand: {
      cwd: sysCtx.repoRoot,
      command: 'npm',
      commandArgs: args,
      commandLabel,
    },
  };
}

/**
 * Build queue args for health snapshot job.
 */
export function buildHealthSnapshotQueueArgs(options: {
  sysCtx: SystemContext;
  requestId: string;
  parsed: ParsedCommandConfig;
}): HealthSnapshotQueueArgs {
  const { sysCtx, requestId, parsed } = options;
  return {
    repoRoot: sysCtx.repoRoot,
    commandLabel: parsed.commandLabel,
    scriptPath: sysCtx.healthSnapshotScriptPath,
    systemId: sysCtx.systemId,
    requestId,
    scriptArgs: parsed.scriptArgs,
  };
}

/**
 * Build queue args for syncing Figma tokens.
 */
export function buildSyncFigmaTokensQueueArgs(options: {
  sysCtx: SystemContext;
  requestId: string;
  parsed: ParsedCommandConfig;
}): SyncFigmaTokensQueueArgs {
  const { sysCtx, requestId, parsed } = options;
  return {
    repoRoot: sysCtx.repoRoot,
    commandLabel: `node tooling/scripts/ds-tokens-from-figma.mjs ${parsed.commandDisplayArgs.join(' ')}`,
    scriptPath: sysCtx.tokensFromFigmaScriptPath,
    systemId: sysCtx.systemId,
    requestId,
    scriptArgs: parsed.commandArgs,
    allowNonZeroJson: true,
  };
}

/**
 * Build queue args for capturing Figma screenshot.
 */
export function buildCaptureFigmaScreenshotQueueArgs(options: {
  sysCtx: SystemContext;
  requestId: string;
  parsed: ParsedCommandConfig;
}): CaptureFigmaScreenshotQueueArgs {
  const { sysCtx, requestId, parsed } = options;
  return {
    repoRoot: sysCtx.repoRoot,
    commandLabel: `node tooling/scripts/ds-capture-from-figma-url.mjs ${parsed.commandDisplayArgs.join(' ')}`,
    scriptPath: sysCtx.captureFromFigmaUrlScriptPath,
    systemId: sysCtx.systemId,
    requestId,
    scriptArgs: parsed.commandArgs,
    allowNonZeroJson: true,
  };
}
