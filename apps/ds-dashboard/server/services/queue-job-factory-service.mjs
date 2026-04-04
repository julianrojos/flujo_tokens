import path from "node:path";

export function createQueueJobFactoryService(config) {
  const {
    getSystemContext,
    enqueueQueueJob,
    runQueuedSpawnCommand,
    sha256Text,
    tokenRepo,
    replayableNpmScripts,
    supportedReplayOperations,
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

  function enqueueReplayJobFromOperation({ operation, systemId, requestId, sourceEventId }) {
    const sysCtx = getSystemContext(systemId);
    const normalized = String(operation || "").trim();
    if (!normalized) throw new Error("Missing operation name.");
    const supportedByExactMatch = supportedReplayOperations.has(normalized);
    const supportedByRunPrefix = normalized.startsWith("run:");
    if (!supportedByExactMatch && !supportedByRunPrefix) {
      if (normalized.startsWith("script:")) {
        throw new Error(`Operation '${normalized}' requires parameters and cannot be replayed automatically.`);
      }
      throw new Error(`Replay is not supported for operation '${normalized}'.`);
    }

    if (normalized.startsWith("script:")) {
      const scriptName = normalized.slice("script:".length).trim();
      if (replayableNpmScripts.has(scriptName)) {
        return queueNpmScript({
          repoRoot: sysCtx.repoRoot,
          script: scriptName,
          systemId: sysCtx.systemId,
          requestId,
          sourceEventId,
        });
      }
      if (scriptName === "ds-health-snapshot.mjs") {
        return queueNodeJsonCommand({
          repoRoot: sysCtx.repoRoot,
          commandLabel:
            "node tooling/scripts/ds-health-snapshot.mjs --before-ref HEAD~1 --retention-days 120 --skip-diff false",
          scriptPath: sysCtx.healthSnapshotScriptPath,
          systemId: sysCtx.systemId,
          requestId,
          sourceEventId,
          scriptArgs: [
            "--before-ref",
            "HEAD~1",
            "--retention-days",
            "120",
            "--skip-diff",
            "false",
            "--format",
            "json",
          ],
        });
      }
      throw new Error(`Operation '${normalized}' requires parameters and cannot be replayed automatically.`);
    }

    if (normalized.startsWith("run:")) {
      const scriptName = normalized.slice("run:".length).trim();
      if (!scriptName) throw new Error("Invalid replay operation script name.");
      const args = ["run", scriptName, "--", "--system", sysCtx.systemId];
      const commandLabel = `npm ${args.join(" ")}`;
      return enqueueQueueJob({
        label: commandLabel,
        systemId: sysCtx.systemId,
        operationName: `run:${scriptName}`,
        requestId,
        sourceEventId,
        inputHash: sha256Text(
          JSON.stringify({
            command: "npm",
            args,
            cwd: sysCtx.repoRoot,
            systemId: sysCtx.systemId,
            scriptName,
            replay: sourceEventId,
          }),
        ),
        execute: async ({ emitChunk, setProcess }) =>
          await runQueuedSpawnCommand({
            cwd: sysCtx.repoRoot,
            command: "npm",
            commandArgs: args,
            emitChunk,
            registerProcess: setProcess,
            commandLabel,
          }),
      });
    }

    throw new Error(`Replay is not supported for operation '${normalized}'.`);
  }

  return {
    queueNpmScript,
    queueNodeJsonCommand,
    enqueueReplayJobFromOperation,
  };
}
