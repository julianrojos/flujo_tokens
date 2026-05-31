import type { DesignSystem } from "@/lib/design-system-context";
import type { FigmaMcpHeartbeatResult } from "@/lib/api";
import { suggestNameFromFigmaUrl } from "@/lib/figma-name-suggestion";

export function normalizeSystemNameForCollision(rawName: string): string {
  return String(rawName || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function findSystemNameCollision(args: {
  candidateName: string;
  systems: DesignSystem[];
}): DesignSystem | null {
  const normalizedCandidate = normalizeSystemNameForCollision(args.candidateName);
  if (!normalizedCandidate) return null;

  for (const system of args.systems) {
    const normalizedExisting = normalizeSystemNameForCollision(system.name);
    if (normalizedExisting === normalizedCandidate) {
      return system;
    }
  }

  return null;
}

function normalizeHeartbeatFileKey(rawFileKey: string | null | undefined): string {
  return String(rawFileKey || "").trim();
}

function normalizeSuggestedSystemName(rawName: string | null | undefined): string {
  return String(rawName || "").trim().replace(/\s+/g, " ");
}

export function suggestSystemNameFromFigmaHeartbeat(args: {
  heartbeat: Pick<FigmaMcpHeartbeatResult, "alive" | "sourceFileKey" | "sourceDocName"> | null;
  expectedFileKey: string;
  currentSystemName: string;
}): string {
  const heartbeat = args.heartbeat;
  if (!heartbeat?.alive) return "";

  const expectedFileKey = normalizeHeartbeatFileKey(args.expectedFileKey);
  const sourceFileKey = normalizeHeartbeatFileKey(heartbeat.sourceFileKey);
  if (!expectedFileKey || sourceFileKey !== expectedFileKey) return "";

  if (String(args.currentSystemName || "").trim()) return "";

  return normalizeSuggestedSystemName(heartbeat.sourceDocName);
}

export function suggestSystemNameFromFigmaUrl(rawUrl: string): string {
  return suggestNameFromFigmaUrl(rawUrl);
}

export function resolveSuggestedSystemName(args: {
  currentSystemName: string;
  figmaUrl: string;
  heartbeat: Pick<FigmaMcpHeartbeatResult, "alive" | "sourceFileKey" | "sourceDocName"> | null;
  expectedFileKey: string;
}): string {
  if (String(args.currentSystemName || "").trim()) return "";
  return (
    suggestSystemNameFromFigmaHeartbeat({
      heartbeat: args.heartbeat,
      expectedFileKey: args.expectedFileKey,
      currentSystemName: args.currentSystemName,
    }) || suggestSystemNameFromFigmaUrl(args.figmaUrl)
  );
}
