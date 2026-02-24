import fs from "node:fs/promises";
import path from "node:path";

export function createQueueJobFactoryService(config) {
  const {
    getSystemContext,
    enqueueQueueJob,
    runQueuedSpawnCommand,
    sha256Text,
    computeNamingDebtReport,
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
    systemId,
    allowNonZeroJson,
    requestId,
    sourceEventId,
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
          cwd: repoRoot,
          systemId: systemId || null,
        }),
      ),
      execute: async ({ emitChunk, setProcess }) =>
        await runQueuedSpawnCommand({
          cwd: repoRoot,
          command: "node",
          commandArgs,
          emitChunk,
          registerProcess: setProcess,
          commandLabel,
          parseJsonStdout: true,
          allowNonZeroJson: allowNonZeroJson === true,
        }),
    });
  }

  function enqueueRefreshNamingDebtJob({ sysCtx, requestId, sourceEventId }) {
    return enqueueQueueJob({
      label: "refresh naming debt",
      systemId: sysCtx.systemId,
      operationName: "refresh:naming-debt",
      requestId,
      sourceEventId,
      inputHash: sha256Text(
        JSON.stringify({
          script: "refresh-naming-debt",
          systemId: sysCtx.systemId,
        }),
      ),
      execute: async ({ emitChunk }) => {
        emitChunk("system", "Computing naming debt report...");
        const report = await computeNamingDebtReport({
          tokenRegistryPath: sysCtx.tokenRegistryPath,
          tokenUsageIndexPath: sysCtx.tokenUsageIndexPath,
          tokenGraphVizPath: sysCtx.tokenGraphVizPath,
          namingDebtConfigPath: sysCtx.namingDebtConfigPath,
        });
        await fs.mkdir(path.dirname(sysCtx.namingDebtCachePath), { recursive: true });
        await fs.writeFile(sysCtx.namingDebtCachePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
        return {
          ok: true,
          code: 0,
          summary: "Naming debt refreshed.",
          payload: {
            ok: true,
            generatedAt: report.generatedAt,
            totalViolations: report.summary.totalViolations,
            overallScore: report.summary.overallScore,
          },
        };
      },
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

    if (normalized === "refresh:naming-debt") {
      return enqueueRefreshNamingDebtJob({ sysCtx, requestId, sourceEventId });
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
    enqueueRefreshNamingDebtJob,
    enqueueReplayJobFromOperation,
  };
}
