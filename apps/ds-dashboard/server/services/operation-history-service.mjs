import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";

export function createOperationHistoryService(config) {
  const {
    repoRoot,
    designSystemRepository,
    normalizeSystemId,
    writeStructuredLog,
    nowIso,
    createOperationEventId,
    opsLogMaxFileBytes,
    opsLogRetentionDays,
    opsHistoryMaxLimit,
    opsLogFileRegex,
  } = config;

  /** @type {Map<string, Promise<void>>} */
  const operationLogWriteLocks = new Map();

  function resolveOpsLogDir(systemId) {
    try {
      const ctx = designSystemRepository.resolveSystemContext(systemId);
      return path.join(ctx.paths.output, ".ops");
    } catch {
      const fallbackId = normalizeSystemId(systemId) || "_unknown";
      return path.join(repoRoot, "output", fallbackId, ".ops");
    }
  }

  function listOpsLogFiles(logDir) {
    try {
      const entries = fsSync.readdirSync(logDir, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile() && opsLogFileRegex.test(entry.name))
        .map((entry) => {
          const absPath = path.join(logDir, entry.name);
          const stat = fsSync.statSync(absPath);
          return { name: entry.name, absPath, mtimeMs: stat.mtimeMs };
        })
        .sort((a, b) => b.mtimeMs - a.mtimeMs || b.name.localeCompare(a.name));
    } catch {
      return [];
    }
  }

  function resolveWritableOpsLogPath(logDir, datePart, appendBytes) {
    let suffix = 0;
    while (suffix < 10_000) {
      const fileName = suffix === 0 ? `operations-${datePart}.ndjson` : `operations-${datePart}.${suffix}.ndjson`;
      const targetPath = path.join(logDir, fileName);
      try {
        const stat = fsSync.statSync(targetPath);
        if (stat.size + appendBytes <= opsLogMaxFileBytes) return targetPath;
      } catch {
        return targetPath;
      }
      suffix += 1;
    }
    return path.join(logDir, `operations-${datePart}.${Date.now()}.ndjson`);
  }

  async function cleanupOpsLogFiles(logDir) {
    const keepAfter = Date.now() - opsLogRetentionDays * 24 * 60 * 60 * 1000;
    const files = listOpsLogFiles(logDir);
    await Promise.all(
      files.map(async (file) => {
        const match = opsLogFileRegex.exec(file.name);
        if (!match) return;
        const dayTs = new Date(`${match[1]}T00:00:00.000Z`).getTime();
        if (!Number.isFinite(dayTs) || dayTs >= keepAfter) return;
        await fs.rm(file.absPath, { force: true });
      }),
    );
  }

  function enqueueOpsLogWrite(logDir, writeTask) {
    const previous = operationLogWriteLocks.get(logDir) || Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(writeTask)
      .finally(() => {
        if (operationLogWriteLocks.get(logDir) === next) {
          operationLogWriteLocks.delete(logDir);
        }
      });
    operationLogWriteLocks.set(logDir, next);
    return next;
  }

  async function appendOperationEvent(entry) {
    const timestamp = String(entry?.timestamp || nowIso());
    const datePart = timestamp.slice(0, 10);
    const logDir = resolveOpsLogDir(entry?.systemId);
    const normalized = {
      id: createOperationEventId(),
      timestamp,
      eventType: String(entry?.eventType || "operation.event"),
      operation: String(entry?.operation || "unknown"),
      system: String(entry?.systemId || ""),
      status: String(entry?.status || "unknown"),
      durationMs: Number.isFinite(entry?.durationMs) ? Number(entry.durationMs) : null,
      requestId: entry?.requestId ? String(entry.requestId) : null,
      jobId: entry?.jobId ? String(entry.jobId) : null,
      sourceEventId: entry?.sourceEventId ? String(entry.sourceEventId) : null,
      inputHash: entry?.inputHash ? String(entry.inputHash) : null,
      outputHash: entry?.outputHash ? String(entry.outputHash) : null,
      result: {
        ok: entry?.result?.ok === true,
        code:
          typeof entry?.result?.code === "number" || typeof entry?.result?.code === "string"
            ? entry.result.code
            : null,
        summary: entry?.result?.summary ? String(entry.result.summary) : null,
      },
    };
    const line = `${JSON.stringify(normalized)}\n`;
    const lineBytes = Buffer.byteLength(line, "utf8");

    await enqueueOpsLogWrite(logDir, async () => {
      await fs.mkdir(logDir, { recursive: true });
      const targetPath = resolveWritableOpsLogPath(logDir, datePart, lineBytes);
      await fs.appendFile(targetPath, line, "utf8");
      await cleanupOpsLogFiles(logDir);
    });
  }

  function appendOperationEventSafe(entry) {
    void appendOperationEvent(entry).catch((error) => {
      if (typeof writeStructuredLog !== "function") return;
      writeStructuredLog("warn", {
        event: "operations.history_write_failed",
        systemId: entry?.systemId ? String(entry.systemId) : null,
        operation: entry?.operation ? String(entry.operation) : null,
        message: error instanceof Error ? error.message : String(error),
      });
    });
  }

  function readOpsLogLines(filePath) {
    try {
      const raw = fsSync.readFileSync(filePath, "utf8");
      return raw.split("\n").filter(Boolean);
    } catch {
      return [];
    }
  }

  function toFiniteTimestamp(raw) {
    const iso = String(raw || "").trim();
    if (!iso) return NaN;
    return new Date(iso).getTime();
  }

  function parseOperationEventLine(line, fallbackSystemId) {
    let parsed = null;
    try {
      parsed = JSON.parse(line);
    } catch {
      return null;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

    const timestamp = String(parsed.timestamp || "").trim();
    const operation = String(parsed.operation || "").trim();
    if (!timestamp || !operation) return null;
    if (!Number.isFinite(toFiniteTimestamp(timestamp))) return null;

    const result =
      parsed.result && typeof parsed.result === "object" && !Array.isArray(parsed.result)
        ? parsed.result
        : null;
    const resultCode = result?.code;

    return {
      id: String(parsed.id || createOperationEventId()),
      timestamp,
      eventType: String(parsed.eventType || "operation.event"),
      operation,
      system: String(parsed.system ?? parsed.systemId ?? fallbackSystemId ?? ""),
      status: String(parsed.status || "unknown").trim().toLowerCase() || "unknown",
      durationMs:
        typeof parsed.durationMs === "number" && Number.isFinite(parsed.durationMs) && parsed.durationMs >= 0
          ? Math.round(parsed.durationMs)
          : null,
      requestId: parsed.requestId ? String(parsed.requestId) : null,
      jobId: parsed.jobId ? String(parsed.jobId) : null,
      sourceEventId: parsed.sourceEventId ? String(parsed.sourceEventId) : null,
      inputHash: parsed.inputHash ? String(parsed.inputHash) : null,
      outputHash: parsed.outputHash ? String(parsed.outputHash) : null,
      result: {
        ok: result?.ok === true,
        code: typeof resultCode === "number" || typeof resultCode === "string" ? resultCode : null,
        summary: result?.summary ? String(result.summary) : null,
      },
    };
  }

  function resolveOperationHistoryTargets(systemId) {
    /** @type {Array<{ systemId: string; logDir: string }>} */
    const targets = [];
    const normalizedSystemId = systemId ? String(systemId).trim() : "";
    if (normalizedSystemId) {
      targets.push({
        systemId: normalizedSystemId,
        logDir: resolveOpsLogDir(normalizedSystemId),
      });
      return targets;
    }

    const config = designSystemRepository.getConfig();
    for (const row of config.systems || []) {
      const id = String(row?.id || "").trim();
      if (!id) continue;
      targets.push({ systemId: id, logDir: resolveOpsLogDir(id) });
    }
    return targets;
  }

  function readOperationHistory({ systemId, operation, status, from, to, limit }) {
    const maxRows = Math.max(1, Math.min(limit, opsHistoryMaxLimit));
    const filters = {
      systemId: systemId ? String(systemId) : "",
      operation: operation ? String(operation).trim().toLowerCase() : "",
      status: status ? String(status).trim().toLowerCase() : "",
      fromTs: toFiniteTimestamp(from),
      toTs: toFiniteTimestamp(to),
    };
    const targets = resolveOperationHistoryTargets(filters.systemId);

    const events = [];
    let scannedRows = 0;
    let scannedFiles = 0;

    for (const target of targets) {
      const files = listOpsLogFiles(target.logDir);
      for (const file of files) {
        scannedFiles += 1;
        const lines = readOpsLogLines(file.absPath);
        for (const line of lines) {
          scannedRows += 1;
          const parsed = parseOperationEventLine(line, target.systemId);
          if (!parsed) continue;
          const eventTs = toFiniteTimestamp(parsed?.timestamp);
          if (Number.isFinite(filters.fromTs) && (!Number.isFinite(eventTs) || eventTs < filters.fromTs)) continue;
          if (Number.isFinite(filters.toTs) && (!Number.isFinite(eventTs) || eventTs > filters.toTs)) continue;
          const eventOperation = String(parsed?.operation || "").trim().toLowerCase();
          if (filters.operation && !eventOperation.includes(filters.operation)) continue;
          const eventStatus = String(parsed?.status || "").trim().toLowerCase();
          if (filters.status && eventStatus !== filters.status) continue;
          events.push(parsed);
        }
      }
    }

    events.sort((a, b) => {
      const aTs = toFiniteTimestamp(a?.timestamp);
      const bTs = toFiniteTimestamp(b?.timestamp);
      if (!Number.isFinite(aTs) && !Number.isFinite(bTs)) return 0;
      if (!Number.isFinite(aTs)) return 1;
      if (!Number.isFinite(bTs)) return -1;
      return bTs - aTs;
    });

    return {
      events: events.slice(0, maxRows),
      scannedRows,
      scannedFiles,
    };
  }

  function findOperationEventById({ eventId, systemId }) {
    const needle = String(eventId || "").trim();
    if (!needle) {
      return { event: null, scannedRows: 0, scannedFiles: 0 };
    }
    const targets = resolveOperationHistoryTargets(systemId);
    let scannedRows = 0;
    let scannedFiles = 0;

    for (const target of targets) {
      const files = listOpsLogFiles(target.logDir);
      for (const file of files) {
        scannedFiles += 1;
        const lines = readOpsLogLines(file.absPath);
        for (let idx = lines.length - 1; idx >= 0; idx -= 1) {
          scannedRows += 1;
          const parsed = parseOperationEventLine(lines[idx], target.systemId);
          if (!parsed) continue;
          if (String(parsed.id || "").trim() !== needle) continue;
          return { event: parsed, scannedRows, scannedFiles };
        }
      }
    }
    return { event: null, scannedRows, scannedFiles };
  }

  function mean(values) {
    if (!Array.isArray(values) || values.length === 0) return null;
    let total = 0;
    for (const value of values) total += Number(value) || 0;
    return total / values.length;
  }

  function roundMetric(value) {
    return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
  }

  function isTerminalOperationStatus(status) {
    return status === "success" || status === "error" || status === "cancelled";
  }

  function normalizeFailureRate(events) {
    if (!Array.isArray(events) || events.length === 0) return null;
    const failures = events.filter((event) => event.status === "error" || event.status === "cancelled").length;
    return failures / events.length;
  }

  function buildOperationRegressionsReport({ systemId, limit, minSamples }) {
    const history = readOperationHistory({
      systemId,
      limit,
    });

    /** @type {Map<string, any[]>} */
    const byOperation = new Map();
    for (const event of history.events) {
      const operation = String(event?.operation || "").trim();
      if (!operation) continue;
      const bucket = byOperation.get(operation) || [];
      bucket.push(event);
      byOperation.set(operation, bucket);
    }

    const regressions = [];
    let operationsAnalyzed = 0;

    for (const [operation, rows] of Array.from(byOperation.entries())) {
      operationsAnalyzed += 1;
      const terminalRows = rows.filter((row) => isTerminalOperationStatus(String(row?.status || "")));
      const successDurations = terminalRows
        .filter((row) => row.status === "success" && typeof row.durationMs === "number" && row.durationMs >= 0)
        .map((row) => Number(row.durationMs));
      const recentDuration = successDurations.slice(0, 5);
      const baselineDuration = successDurations.slice(5, 25);
      const recentDurationAvg = mean(recentDuration);
      const baselineDurationAvg = mean(baselineDuration);

      const recentTerminal = terminalRows.slice(0, 10);
      const baselineTerminal = terminalRows.slice(10, 40);
      const recentFailureRate = normalizeFailureRate(recentTerminal);
      const baselineFailureRate = normalizeFailureRate(baselineTerminal);

      const signals = [];
      let severityScore = 0;

      if (
        Number.isFinite(recentDurationAvg) &&
        Number.isFinite(baselineDurationAvg) &&
        baselineDuration.length >= minSamples &&
        recentDuration.length >= 2
      ) {
        const ratio = baselineDurationAvg > 0 ? recentDurationAvg / baselineDurationAvg : null;
        const deltaMs = recentDurationAvg - baselineDurationAvg;
        if (Number.isFinite(ratio) && ratio >= 1.5 && deltaMs >= 250) {
          severityScore += ratio >= 2 ? 2 : 1;
          signals.push({
            kind: "duration",
            severity: ratio >= 2 ? "high" : "medium",
            message: `Average duration increased from ${Math.round(baselineDurationAvg)}ms to ${Math.round(recentDurationAvg)}ms.`,
            metrics: {
              recentAvgDurationMs: Math.round(recentDurationAvg),
              baselineAvgDurationMs: Math.round(baselineDurationAvg),
              ratio: roundMetric(ratio),
            },
          });
        }
      }

      if (
        Number.isFinite(recentFailureRate) &&
        Number.isFinite(baselineFailureRate) &&
        baselineTerminal.length >= minSamples &&
        recentTerminal.length >= 3
      ) {
        const deltaFailure = recentFailureRate - baselineFailureRate;
        if (recentFailureRate >= 0.3 && deltaFailure >= 0.2) {
          severityScore += deltaFailure >= 0.4 ? 2 : 1;
          signals.push({
            kind: "failure_rate",
            severity: deltaFailure >= 0.4 ? "high" : "medium",
            message: `Failure rate increased from ${Math.round(baselineFailureRate * 100)}% to ${Math.round(recentFailureRate * 100)}%.`,
            metrics: {
              recentFailureRate: roundMetric(recentFailureRate),
              baselineFailureRate: roundMetric(baselineFailureRate),
              delta: roundMetric(deltaFailure),
            },
          });
        }
      }

      if (signals.length === 0) continue;

      const latest = rows[0] || null;
      regressions.push({
        operation,
        system: latest?.system || systemId || null,
        latestTimestamp: latest?.timestamp || null,
        latestStatus: latest?.status || null,
        severity: severityScore >= 3 ? "high" : "medium",
        signals,
        samples: {
          total: rows.length,
          terminal: terminalRows.length,
          recentDuration: recentDuration.length,
          baselineDuration: baselineDuration.length,
          recentFailure: recentTerminal.length,
          baselineFailure: baselineTerminal.length,
        },
      });
    }

    regressions.sort((left, right) => {
      const score = (regression) => (regression.severity === "high" ? 2 : 1);
      const bySeverity = score(right) - score(left);
      if (bySeverity !== 0) return bySeverity;
      const leftTs = toFiniteTimestamp(left.latestTimestamp);
      const rightTs = toFiniteTimestamp(right.latestTimestamp);
      if (!Number.isFinite(leftTs) && !Number.isFinite(rightTs)) return 0;
      if (!Number.isFinite(leftTs)) return 1;
      if (!Number.isFinite(rightTs)) return -1;
      return rightTs - leftTs;
    });

    return {
      generatedAt: nowIso(),
      regressions,
      summary: {
        operationsAnalyzed,
        regressionsDetected: regressions.length,
        scannedRows: history.scannedRows,
        scannedFiles: history.scannedFiles,
      },
    };
  }

  return {
    appendOperationEventSafe,
    toFiniteTimestamp,
    readOperationHistory,
    findOperationEventById,
    buildOperationRegressionsReport,
  };
}
