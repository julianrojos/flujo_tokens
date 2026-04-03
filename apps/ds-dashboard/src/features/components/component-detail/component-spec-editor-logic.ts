import type { PartialComponentSpec } from "ds-types";

// ─── Summary ───────────────────────────────────────────────────────────────

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
    normalizeSummaryMarkdownForDirty(summary.purpose) !==
    normalizeSummaryMarkdownForDirty(baselineSummary.purpose) ||
    normalizeSummaryMarkdownForDirty(summary.when_to_use) !==
    normalizeSummaryMarkdownForDirty(baselineSummary.when_to_use) ||
    normalizeSummaryMarkdownForDirty(summary.when_not_to_use) !==
    normalizeSummaryMarkdownForDirty(baselineSummary.when_not_to_use)
  );
}

// ─── Best Practices ────────────────────────────────────────────────────────

export interface BestPracticesFields {
  do: string[];
  dont: string[];
}

export function toBestPractices(spec: PartialComponentSpec | null): BestPracticesFields {
  return {
    do: Array.isArray(spec?.best_practices?.do) ? [...spec.best_practices.do] : [],
    dont: Array.isArray(spec?.best_practices?.dont) ? [...spec.best_practices.dont] : [],
  };
}

export function isBestPracticesDirty(
  current: BestPracticesFields,
  baseline: BestPracticesFields,
): boolean {
  return !normalizedListEquals(normalizeStringList(current.do), normalizeStringList(baseline.do)) ||
    !normalizedListEquals(normalizeStringList(current.dont), normalizeStringList(baseline.dont));
}

// ─── Content Guidelines ────────────────────────────────────────────────────

export interface ContentGuidelinesFields {
  rules: string[];
}

export function toContentGuidelines(spec: PartialComponentSpec | null): ContentGuidelinesFields {
  return {
    rules: Array.isArray(spec?.content_guidelines?.rules)
      ? [...spec.content_guidelines.rules]
      : [],
  };
}

export function isContentGuidelinesDirty(
  current: ContentGuidelinesFields,
  baseline: ContentGuidelinesFields,
): boolean {
  return !normalizedListEquals(
    normalizeStringList(current.rules),
    normalizeStringList(baseline.rules),
  );
}

// ─── Accessibility ─────────────────────────────────────────────────────────

export interface AccessibilityFields {
  role: string;
  labelingRules: string[];
  notes: string[];
}

export function toAccessibility(spec: PartialComponentSpec | null): AccessibilityFields {
  const acc = spec?.accessibility;
  return {
    role: String(acc?.role || ""),
    labelingRules: Array.isArray(acc?.labeling?.rules) ? [...acc.labeling.rules] : [],
    notes: Array.isArray(acc?.notes) ? [...acc.notes] : [],
  };
}

export function isAccessibilityDirty(
  current: AccessibilityFields,
  baseline: AccessibilityFields,
): boolean {
  return current.role.trim() !== baseline.role.trim() ||
    !normalizedListEquals(
      normalizeStringList(current.labelingRules),
      normalizeStringList(baseline.labelingRules),
    ) ||
    !normalizedListEquals(
      normalizeStringList(current.notes),
      normalizeStringList(baseline.notes),
    );
}

// ─── Normalization helper ──────────────────────────────────────────────────

export function normalizeStringList(items: string[]): string[] {
  return items.map((item) => item.trim()).filter(Boolean);
}

function normalizedListEquals(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function normalizeSummaryMarkdownForDirty(value: string): string {
  const normalizedNewlines = value.replace(/\r\n?/g, "\n");
  // Ignore a single trailing newline often introduced by markdown editors.
  return normalizedNewlines.endsWith("\n")
    ? normalizedNewlines.slice(0, -1)
    : normalizedNewlines;
}

// ─── Cancel intent ─────────────────────────────────────────────────────────

export function resolveCancelIntent(isDirty: boolean): "confirm" | "close" {
  return isDirty ? "confirm" : "close";
}

// ─── Payload builder ───────────────────────────────────────────────────────

interface BuildEditorialPayloadArgs {
  summary: SummaryFields;
  baselineSummary: SummaryFields;
  bestPractices: BestPracticesFields;
  baselineBestPractices: BestPracticesFields;
  contentGuidelines: ContentGuidelinesFields;
  baselineContentGuidelines: ContentGuidelinesFields;
  accessibility: AccessibilityFields;
  baselineAccessibility: AccessibilityFields;
  spec: PartialComponentSpec | null;
}

export function buildEditorialPayload(
  args: BuildEditorialPayloadArgs,
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};

  const summaryDirty = isSummaryDirty(args.summary, args.baselineSummary);
  const bpDirty = isBestPracticesDirty(args.bestPractices, args.baselineBestPractices);
  const cgDirty = isContentGuidelinesDirty(args.contentGuidelines, args.baselineContentGuidelines);
  const accDirty = isAccessibilityDirty(args.accessibility, args.baselineAccessibility);

  if (summaryDirty) {
    fields.summary = args.summary;
  }

  if (bpDirty) {
    const normalizedDo = normalizeStringList(args.bestPractices.do);
    const normalizedDont = normalizeStringList(args.bestPractices.dont);
    if (normalizedDo.length > 0 || normalizedDont.length > 0) {
      fields.best_practices = { do: normalizedDo, dont: normalizedDont };
    }
  }

  if (cgDirty) {
    const normalizedRules = normalizeStringList(args.contentGuidelines.rules);
    if (normalizedRules.length > 0) {
      fields.content_guidelines = { rules: normalizedRules };
    }
  }

  if (accDirty) {
    const roleTrimmed = args.accessibility.role.trim();
    const normalizedLabelingRules = normalizeStringList(args.accessibility.labelingRules);
    const normalizedNotes = normalizeStringList(args.accessibility.notes);
    const hasRole = roleTrimmed.length > 0;
    const hasLabelingRules = normalizedLabelingRules.length > 0;
    const hasNotes = normalizedNotes.length > 0;

    if (hasRole || hasLabelingRules || hasNotes) {
      const baseA = (args.spec?.accessibility as Record<string, unknown> | undefined) ?? {};
      const baseLabeling =
        typeof baseA.labeling === "object" && baseA.labeling !== null
          ? (baseA.labeling as Record<string, unknown>)
          : {};
      fields.accessibility = {
        ...baseA,
        role: roleTrimmed,
        labeling: {
          ...baseLabeling,
          rules: normalizedLabelingRules,
        },
        notes: normalizedNotes,
      };
    }
  }

  return fields;
}

// ─── Persistence ───────────────────────────────────────────────────────────

interface PersistEditorialArgs {
  slug: string;
  expectedUpdatedAt: number | null;
  summary: SummaryFields;
  baselineSummary: SummaryFields;
  bestPractices: BestPracticesFields;
  baselineBestPractices: BestPracticesFields;
  contentGuidelines: ContentGuidelinesFields;
  baselineContentGuidelines: ContentGuidelinesFields;
  accessibility: AccessibilityFields;
  baselineAccessibility: AccessibilityFields;
  spec: PartialComponentSpec | null;
}

interface PersistEditorialDeps {
  patchEditorialSpecFn: (args: {
    slug: string;
    expectedUpdatedAt?: number | null;
    fields: Record<string, unknown>;
  }) => Promise<{
    ok: boolean;
    updatedAt: number | null;
    savedKeys?: string[];
    message?: string;
    markdownSynced?: boolean;
  }>;
}

export async function persistEditorial(
  args: PersistEditorialArgs,
  deps: PersistEditorialDeps,
): Promise<{ message: string; updatedAt: number | null; markdownSynced: boolean }> {
  const { patchEditorialSpecFn } = deps;

  const fields = buildEditorialPayload({
    summary: args.summary,
    baselineSummary: args.baselineSummary,
    bestPractices: args.bestPractices,
    baselineBestPractices: args.baselineBestPractices,
    contentGuidelines: args.contentGuidelines,
    baselineContentGuidelines: args.baselineContentGuidelines,
    accessibility: args.accessibility,
    baselineAccessibility: args.baselineAccessibility,
    spec: args.spec,
  });

  if (Object.keys(fields).length === 0) {
    return {
      message: "No changes to save.",
      updatedAt: args.expectedUpdatedAt,
      markdownSynced: true,
    };
  }

  const payload = await patchEditorialSpecFn({
    slug: args.slug,
    expectedUpdatedAt: args.expectedUpdatedAt,
    fields,
  });

  if (!payload.ok) {
    throw new Error(payload.message || "Unable to save editorial fields.");
  }

  const sentKeys = Object.keys(fields);
  const savedKeys = payload.savedKeys ?? sentKeys;
  const missing = sentKeys.filter((k) => !savedKeys.includes(k));
  if (missing.length > 0) {
    throw new Error(`Fields not persisted: ${missing.join(", ")}`);
  }

  return {
    message: payload.message || "Editorial fields saved successfully.",
    updatedAt: payload.updatedAt,
    markdownSynced: payload.markdownSynced === true,
  };
}

/**
 * @deprecated Use {@link persistEditorial} instead.
 * Kept as a thin wrapper for backward compatibility during migration.
 */
export async function persistSummaryEditorial(
  args: { slug: string; expectedUpdatedAt: number | null; summary: SummaryFields },
  deps: PersistEditorialDeps,
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
