import type { DesignSystem } from "@/lib/design-system-context";
import type { FigmaMcpHeartbeatResult } from "@/lib/api";

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

function extractFigmaFileKeyFromUrl(rawUrl: string): string {
  const value = String(rawUrl || "").trim();
  if (!value) return "";

  try {
    const parsed = new URL(value);
    const segments = parsed.pathname.split("/").filter(Boolean);
    for (let i = 0; i < segments.length - 1; i += 1) {
      if (segments[i] === "file" || segments[i] === "design") {
        return segments[i + 1] || "";
      }
    }
  } catch {
    return "";
  }

  return "";
}

function humanizeFigmaSlug(rawSlug: string): string {
  return String(rawSlug || "")
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b([a-z])/g, (match) => match.toUpperCase());
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
  const value = String(rawUrl || "").trim();
  if (!value) return "";

  try {
    const parsed = new URL(value);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const fileKey = extractFigmaFileKeyFromUrl(value);
    if (!fileKey) return "";

    const fileIndex = segments.findIndex((segment) => segment === "file" || segment === "design");
    if (fileIndex < 0) return "";

    const slug = segments[fileIndex + 2] || "";
    return humanizeFigmaSlug(slug);
  } catch {
    return "";
  }
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
