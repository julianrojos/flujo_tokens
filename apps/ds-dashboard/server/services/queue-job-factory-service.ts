import path from "node:path";

export interface QueueJobFactoryConfig {
  getSystemContext: (systemId: string) => { repoRoot: string; [key: string]: unknown };
  enqueueQueueJob: (payload: {
    label: string;
    systemId: string;
    requestId?: string;
    sourceEventId?: string;
    operationName: string;
    inputHash: string;
    execute: (args: {
      emitChunk: (kind: string, text: string) => void;
      setProcess: (process: unknown) => void;
      isCancelled: () => boolean;
    }) => Promise<unknown>;
  }) => { id: string };
  runQueuedSpawnCommand: (args: {
    cwd: string;
    command: string;
    commandArgs: string[];
    emitChunk: (kind: string, text: string) => void;
    registerProcess: (process: unknown) => void;
    commandLabel: string;
    commandEnv?: Record<string, string>;
    parseJsonStdout?: boolean;
    allowNonZeroJson?: boolean;
  }) => Promise<Record<string, unknown>>;
  sha256Text: (value: string) => string;
  tokenRepo?: unknown;
}

function shouldUseTsxLoader(scriptPath: string): boolean {
  const normalizedPath = String(scriptPath || "").trim().toLowerCase();
  return (
    normalizedPath.endsWith(".ts") ||
    normalizedPath.endsWith(".tsx") ||
    normalizedPath.endsWith(".mts") ||
    normalizedPath.endsWith(".cts")
  );
}

function buildNodeCommandArgs(scriptPath: string, scriptArgs: string[]): string[] {
  const normalizedScriptPath = String(scriptPath || "").trim();
  const extraArgs = Array.isArray(scriptArgs) ? [...scriptArgs] : [];
  return shouldUseTsxLoader(normalizedScriptPath)
    ? ["--import", "tsx", normalizedScriptPath, ...extraArgs]
    : [normalizedScriptPath, ...extraArgs];
}

export function createQueueJobFactoryService(config: QueueJobFactoryConfig) {
  const {
    getSystemContext,
    enqueueQueueJob,
    runQueuedSpawnCommand,
    sha256Text,
  } = config;

  function queueNpmScript({
    repoRoot,
    script,
    systemId,
    commandLabel,
    requestId,
    sourceEventId,
  }: {
    repoRoot: string;
    script: string;
    systemId?: string;
    commandLabel?: string;
    requestId?: string;
    sourceEventId?: string;
  }) {
    const safeScript = String(script || "").trim();
    if (!safeScript) throw new Error("Missing script name.");

    const scriptArgs = ["run", safeScript, "--"];
    if (systemId) scriptArgs.push("--system", systemId);
    const label = commandLabel || `npm run ${safeScript}`;

    return enqueueQueueJob({
      label,
      systemId: systemId || "",
      requestId,
      sourceEventId,
      operationName: `script:${safeScript}`,
      inputHash: sha256Text(
        JSON.stringify({
          command: "npm",
          script: safeScript,
          args: scriptArgs,
          cwd: repoRoot,
          systemId: systemId || null,
        }),
      ),
      execute: async ({ emitChunk, setProcess }) =>
        await runQueuedSpawnCommand({
          cwd: repoRoot,
          command: "npm",
          commandArgs: scriptArgs,
          emitChunk,
          registerProcess: setProcess,
          commandLabel: label,
        }),
    });
  }

  function queueNodeJsonCommand({
    repoRoot,
    commandLabel,
    scriptPath,
    scriptArgs,
    commandEnv,
    systemId,
    allowNonZeroJson,
    requestId,
    sourceEventId,
    onSuccess,
  }: {
    repoRoot: string;
    commandLabel: string;
    scriptPath: string;
    scriptArgs: string[];
    commandEnv?: Record<string, string>;
    systemId?: string;
    allowNonZeroJson?: boolean;
    requestId?: string;
    sourceEventId?: string;
    onSuccess?: (args: {
      payload: unknown;
      result: Record<string, unknown>;
      emitChunk: (kind: string, text: string) => void;
      repoRoot: string;
      systemId?: string;
      scriptPath: string;
      commandLabel: string;
    }) => Promise<void>;
  }) {
    const finalArgs = [...scriptArgs];
    if (systemId) finalArgs.push("--system", systemId);
    const commandArgs = buildNodeCommandArgs(scriptPath, finalArgs);

    return enqueueQueueJob({
      label: commandLabel,
      systemId: systemId || "",
      requestId,
      sourceEventId,
      operationName: `script:${path.basename(scriptPath)}`,
      inputHash: sha256Text(
        JSON.stringify({
          command: "node",
          scriptPath,
          args: commandArgs,
          envKeys: Object.keys(commandEnv || {}).sort(),
          cwd: repoRoot,
          systemId: systemId || null,
        }),
      ),
      execute: async ({ emitChunk, setProcess }) =>
        await (async () => {
          const result = await runQueuedSpawnCommand({
            cwd: repoRoot,
            command: "node",
            commandArgs,
            commandEnv,
            emitChunk,
            registerProcess: setProcess,
            commandLabel,
            parseJsonStdout: true,
            allowNonZeroJson: allowNonZeroJson === true,
          });

          if (!(result as { ok?: boolean })?.ok || typeof onSuccess !== "function") {
            return result;
          }

          try {
            await onSuccess({
              payload: (result as { payload?: unknown }).payload,
              result,
              emitChunk,
              repoRoot,
              systemId,
              scriptPath,
              commandLabel,
            });
            return result;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            emitChunk("error", message);
            const payloadBase =
              (result as { payload?: unknown })?.payload &&
              typeof (result as { payload?: unknown }).payload === "object"
                ? (result as { payload?: Record<string, unknown> }).payload
                : {};
            return {
              ...result,
              ok: false,
              code: 1,
              summary: `Post-processing failed: ${message}`,
              payload: {
                ...payloadBase,
                ok: false,
                post_process_error: message,
              },
            };
          }
        })(),
    });
  }

  return {
    queueNpmScript,
    queueNodeJsonCommand,
  };
}
