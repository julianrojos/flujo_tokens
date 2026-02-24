export function isQueueJobFinalStatus(status) {
  return status === "success" || status === "error" || status === "cancelled";
}

export function queueJobSnapshot(job) {
  return {
    id: job.id,
    label: job.label,
    operation: job.operationName,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    systemId: job.systemId,
    requestId: job.requestId || null,
    sourceEventId: job.sourceEventId || null,
    result: job.result,
  };
}

export function queueJobAcceptedPayload(job) {
  return {
    ok: true,
    accepted: true,
    jobId: job.id,
    requestId: job.requestId || null,
    status: job.status,
    statusUrl: `/api/jobs/${job.id}`,
    streamUrl: `/api/jobs/${job.id}/stream`,
    job: queueJobSnapshot(job),
  };
}

export function listQueueJobEvents(job, args = {}) {
  const since = Number.isFinite(args.since) ? Number(args.since) : 0;
  const limit = Number.isFinite(args.limit) ? Math.max(1, Number(args.limit)) : 300;
  const filtered = job.events.filter((event) => event.seq > since);
  if (filtered.length <= limit) return filtered;
  return filtered.slice(filtered.length - limit);
}

export function toQueueSummaryFromPayload(payload, fallbackCode) {
  const row = payload && typeof payload === "object" ? payload : {};
  const topLevelMessage = String(row.message ?? "").trim();
  const topLevelError = String(row.error ?? "").trim();
  const sync = row.sync && typeof row.sync === "object" ? row.sync : null;
  const syncError = String(sync?.error ?? "").trim();
  const syncReason = String(sync?.reason ?? "").trim();
  const explicitCode = Number(row.code ?? row.exit_code ?? fallbackCode);
  const codeText = Number.isFinite(explicitCode) ? `Failed with code ${explicitCode}` : "Unknown error";
  return topLevelMessage || topLevelError || syncError || syncReason || codeText;
}

export function toQueueTerminalEvent(job) {
  const status = isQueueJobFinalStatus(job?.status) ? job.status : "error";
  const result = job?.result && typeof job.result === "object" ? job.result : {};
  const explicitCode = Number(result.code);
  const code = Number.isFinite(explicitCode) ? explicitCode : status === "success" ? 0 : 1;
  const summary =
    String(result.summary || "").trim() ||
    (status === "success" ? "Completed successfully." : "Unknown error.");
  return {
    type: "end",
    status,
    code,
    summary,
    payload: result.payload,
  };
}
