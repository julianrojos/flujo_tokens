import type { DesignSystem } from "@/lib/design-system-context";

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
