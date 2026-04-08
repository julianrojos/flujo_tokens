import path from "node:path";

export function createQueueJobFactoryService(config) {
  const {
    getSystemContext,
    enqueueQueueJob,
    runQueuedSpawnCommand,
    sha256Text,
    tokenRepo,
  } = config;

  function queueNpmScript({ repoRoot, script, systemId, commandLabel, requestId, sourceEventId }) {
    const safeScript = String(script || "").trim();
    if (!safeScript) throw new Error("Missing script name.");

    const scriptArgs = ["run", safeScript, "--"];
    if (systemId) scriptArgs.push("--system", systemId);
    const label = commandLabel || `npm run ${safeScript}`;

    return enqueueQueueJob({
      label,
      systemId,
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
  }) {
    const finalArgs = [...scriptArgs];
    if (systemId) finalArgs.push("--system", systemId);
    const commandArgs = [scriptPath, ...finalArgs];

    return enqueueQueueJob({
      label: commandLabel,
      systemId,
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

          if (!result?.ok || typeof onSuccess !== "function") {
            return result;
          }

          try {
            await onSuccess({
              payload: result.payload,
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
              result?.payload && typeof result.payload === "object" ? result.payload : {};
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
