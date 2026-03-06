import type { PartialComponentSpec } from "ds-types";

export interface SummaryFields {
  purpose: string;
  when_to_use: string;
  when_not_to_use: string;
}

export function toSummary(spec: PartialComponentSpec | null): SummaryFields {
  return {
    purpose: String(spec?.summary?.purpose || ""),
    when_to_use: String(spec?.summary?.when_to_use || ""),
    when_not_to_use: String(spec?.summary?.when_not_to_use || ""),
  };
}

export function isSummaryDirty(summary: SummaryFields, baselineSummary: SummaryFields): boolean {
  return (
    summary.purpose !== baselineSummary.purpose ||
    summary.when_to_use !== baselineSummary.when_to_use ||
    summary.when_not_to_use !== baselineSummary.when_not_to_use
  );
}

export function resolveCancelIntent(isDirty: boolean): "confirm" | "close" {
  return isDirty ? "confirm" : "close";
}

interface PersistSummaryEditorialArgs {
  slug: string;
  expectedHash: string | null;
  summary: SummaryFields;
}

interface PersistSummaryEditorialDeps {
  patchEditorialSpecFn: (args: {
    slug: string;
    expectedHash?: string | null;
    fields: Record<string, unknown>;
  }) => Promise<{
    ok: boolean;
    rawHash: string | null;
    message?: string;
  }>;
}

export async function persistSummaryEditorial(
  args: PersistSummaryEditorialArgs,
  deps: PersistSummaryEditorialDeps,
): Promise<{ message: string; rawHash: string | null }> {
  const { patchEditorialSpecFn } = deps;
  const payload = await patchEditorialSpecFn({
    slug: args.slug,
    expectedHash: args.expectedHash,
    fields: { summary: args.summary },
  });
  if (!payload.ok) {
    throw new Error(payload.message || "Unable to save editorial fields.");
  }
  return {
    message: payload.message || "Editorial fields saved successfully.",
    rawHash: payload.rawHash,
  };
}
