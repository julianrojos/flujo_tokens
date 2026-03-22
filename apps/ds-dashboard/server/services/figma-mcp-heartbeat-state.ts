export interface FigmaMcpHeartbeatSnapshot {
  lastSeenAt: number | null;
  sourceFileKey: string | null;
  sourceDocName: string | null;
  pluginVersion: string | null;
  pluginBuild: string | null;
}

export interface FigmaMcpHeartbeatStatus extends FigmaMcpHeartbeatSnapshot {
  alive: boolean;
  ageMs: number | null;
}

const HEARTBEAT_TTL_MS = 20_000;

let lastSeenAt: number | null = null;
let sourceFileKey: string | null = null;
let sourceDocName: string | null = null;
let pluginVersion: string | null = null;
let pluginBuild: string | null = null;

export function recordFigmaMcpHeartbeat(args: {
  seenAt: number;
  fileKey?: string | null;
  docName?: string | null;
  pluginVersion?: string | null;
  pluginBuild?: string | null;
}): void {
  const seenAt = Number(args.seenAt);
  if (!Number.isFinite(seenAt) || seenAt <= 0) return;

  lastSeenAt = Math.floor(seenAt);
  sourceFileKey = String(args.fileKey ?? '').trim() || null;
  sourceDocName = String(args.docName ?? '').trim() || null;
  pluginVersion = String(args.pluginVersion ?? '').trim() || null;
  pluginBuild = String(args.pluginBuild ?? '').trim() || null;
}

export function getFigmaMcpHeartbeatStatus(nowMs: number = Date.now()): FigmaMcpHeartbeatStatus {
  if (!lastSeenAt) {
    return {
      alive: false,
      ageMs: null,
      lastSeenAt: null,
      sourceFileKey: null,
      sourceDocName: null,
      pluginVersion: null,
      pluginBuild: null,
    };
  }
  const ageMs = Math.max(0, Math.floor(nowMs - lastSeenAt));
  return {
    alive: ageMs <= HEARTBEAT_TTL_MS,
    ageMs,
    lastSeenAt,
    sourceFileKey,
    sourceDocName,
    pluginVersion,
    pluginBuild,
  };
}

export function resetFigmaMcpHeartbeatState(): void {
  lastSeenAt = null;
  sourceFileKey = null;
  sourceDocName = null;
  pluginVersion = null;
  pluginBuild = null;
}
