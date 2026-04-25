/**
 * Command Route Enqueue Service
 *
 * Builds queue arguments for command route handlers.
 */

export interface SystemContext {
  repoRoot: string;
  systemId: string;
  captureFromFigmaUrlScriptPath: string;
}

type ParseScriptNameSuccess = {
  ok: true;
  scriptName: string;
};

type ParseScriptNameFailure = {
  ok: false;
  statusCode: number;
  errorArgs: {
    code: string;
    userMessage: string;
    recoverable: boolean;
    requestId: string;
  };
};

export type ParseScriptNameResult = ParseScriptNameSuccess | ParseScriptNameFailure;

const ALLOWED_RUN_SCRIPTS = new Set<string>([
  'ds:token-usage-index',
]);

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


export interface CaptureFigmaScreenshotQueueArgs {
  repoRoot: string;
  commandLabel: string;
  scriptPath: string;
  systemId: string;
  requestId: string;
  scriptArgs: string[];
  commandEnv?: Record<string, string>;
  allowNonZeroJson: boolean;
}

export interface ParsedNodeJsonCommandConfig {
  commandDisplayArgs: string[];
  commandArgs: string[];
  commandEnv?: Record<string, string>;
}

/**
 * Parse script name from route parameter.
 */
export function parseScriptNameFromRoute(rawScriptName: unknown, requestId: string): ParseScriptNameResult {
  const scriptName = String(rawScriptName || '').trim();
  if (!scriptName) {
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
  if (!ALLOWED_RUN_SCRIPTS.has(scriptName)) {
    return {
      ok: false,
      statusCode: 400,
      errorArgs: {
        code: 'validation.unsupported_script_name',
        userMessage: `Unsupported script "${scriptName}".`,
        recoverable: true,
        requestId,
      },
    };
  }
  return { ok: true, scriptName };
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
 * Build queue args for capturing Figma screenshot.
 */
export function buildCaptureFigmaScreenshotQueueArgs(options: {
  sysCtx: SystemContext;
  requestId: string;
  parsed: ParsedNodeJsonCommandConfig;
}): CaptureFigmaScreenshotQueueArgs {
  const { sysCtx, requestId, parsed } = options;
  return {
    repoRoot: sysCtx.repoRoot,
    commandLabel: `node --import tsx tooling/src/runners/capture-from-figma-url-runner.ts ${parsed.commandDisplayArgs.join(' ')}`,
    scriptPath: sysCtx.captureFromFigmaUrlScriptPath,
    systemId: sysCtx.systemId,
    requestId,
    scriptArgs: parsed.commandArgs,
    commandEnv: parsed.commandEnv,
    allowNonZeroJson: true,
  };
}
