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
  expectedUpdatedAt: number | null;
  summary: SummaryFields;
}

interface PersistSummaryEditorialDeps {
  patchEditorialSpecFn: (args: {
    slug: string;
    expectedUpdatedAt?: number | null;
    fields: Record<string, unknown>;
  }) => Promise<{
    ok: boolean;
    updatedAt: number | null;
    message?: string;
    markdownSynced?: boolean;
  }>;
}

export async function persistSummaryEditorial(
  args: PersistSummaryEditorialArgs,
  deps: PersistSummaryEditorialDeps,
): Promise<{ message: string; updatedAt: number | null; markdownSynced: boolean }> {
  const { patchEditorialSpecFn } = deps;
  const payload = await patchEditorialSpecFn({
    slug: args.slug,
    expectedUpdatedAt: args.expectedUpdatedAt,
    fields: { summary: args.summary },
  });
  if (!payload.ok) {
    throw new Error(payload.message || "Unable to save editorial fields.");
  }
  return {
    message: payload.message || "Editorial fields saved successfully.",
    updatedAt: payload.updatedAt,
    markdownSynced: payload.markdownSynced === true,
  };
}
