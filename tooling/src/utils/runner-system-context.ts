import type { ScriptSystemContext } from './system-context.js';
import { resolveSystemContextSafe } from './system-context.js';

interface ParsedArgs {
  [key: string]: string | boolean;
}

interface LoggerLike {
  error(message: string): void;
}

interface ResolveRunnerSystemContextOptions {
  parsedArgs: ParsedArgs;
  argName?: string;
  resolveContext?: (opts?: { system?: string }) => ScriptSystemContext;
}

interface ResolveRunnerSystemContextOrExitOptions
  extends ResolveRunnerSystemContextOptions {
  logger?: LoggerLike;
  exitFn?: (code: number) => never;
  writeError?: (message: string) => void;
}

function isValidSystemId(value: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(value);
}

/**
 * Resolve system context from parsed CLI args with strict validation for empty
 * explicit system values.
 */
export function resolveRunnerSystemContext(
  options: ResolveRunnerSystemContextOptions,
): ScriptSystemContext {
  const argName = options.argName || 'system';
  const rawValue = options.parsedArgs[argName];
  const hasExplicitArg = Object.prototype.hasOwnProperty.call(
    options.parsedArgs,
    argName,
  );

  if (hasExplicitArg && typeof rawValue !== 'string') {
    throw new Error(`--${argName} requires an explicit value.`);
  }

  if (hasExplicitArg && typeof rawValue === 'string' && rawValue.trim() === '') {
    throw new Error(
      `--${argName} cannot be empty. Provide a valid system id or omit the flag.`,
    );
  }

  const systemId =
    typeof rawValue === 'string' && rawValue.trim() ? rawValue.trim() : undefined;

  if (systemId && !isValidSystemId(systemId)) {
    throw new Error(
      `--${argName} has invalid format. Allowed characters: letters, numbers, ".", "_" and "-".`,
    );
  }

  const resolveContext = options.resolveContext || resolveSystemContextSafe;
  return resolveContext({ system: systemId });
}

/**
 * Resolve system context and terminate the current CLI process with a friendly
 * error message if resolution fails.
 */
export function resolveRunnerSystemContextOrExit(
  options: ResolveRunnerSystemContextOrExitOptions,
): ScriptSystemContext {
  try {
    return resolveRunnerSystemContext(options);
  } catch (error) {
    const message = `Failed to resolve system context: ${error instanceof Error ? error.message : String(error)}`;
    if (options.logger) {
      options.logger.error(message);
    } else if (options.writeError) {
      options.writeError(message);
    } else {
      process.stderr.write(`${message}\n`);
    }
    const exitFn: (code: number) => never =
      options.exitFn || ((code: number): never => process.exit(code));
    return exitFn(1);
  }
}
