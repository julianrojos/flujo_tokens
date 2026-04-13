import { ApiError } from "@/lib/api";
import { toNonEmptyString, toRecord } from "./new-system-transforms";

interface ProofErrorContext {
  importMode: string;
  importedCount: number;
  missingMainProofSlugs: string[];
  totalMissingMainProofs: number;
  missingVariantProofSlugs: Array<{ slug: string; missingVariants: string[] }>;
  totalMissingVariantProofs: number;
  variantExpectationErrors: Array<{ slug: string; reason: string }>;
  totalVariantExpectationErrors: number;
}

function toNonNegativeFiniteInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
}

export function extractProofErrorContext(error: unknown): ProofErrorContext | null {
  if (!(error instanceof ApiError)) return null;
  const payload = toRecord(error.payload);
  if (!payload) return null;

  let code = toNonEmptyString(payload.code);
  let context = toRecord(payload.context);

  // Defensive fallback: direct sync responses may carry code/context at top-level.
  // Current queue-based flow usually nests this under job.result.payload.
  if (code !== "sync.component_proofs_required_failed") {
    const job = toRecord(payload.job);
    const result = toRecord(job?.result);
    const resultPayload = toRecord(result?.payload);
    code = toNonEmptyString(resultPayload?.code) || toNonEmptyString(result?.code);
    context = toRecord(resultPayload?.context) || toRecord(result?.context);
  }

  if (code !== "sync.component_proofs_required_failed") return null;
  if (!context) return null;
  const mainFallbackCount = Array.isArray(context.missingMainProofSlugs)
    ? context.missingMainProofSlugs.length
    : 0;
  const variantsFallbackCount = Array.isArray(context.missingVariantProofSlugs)
    ? context.missingVariantProofSlugs.length
    : 0;
  const expectationFallbackCount = Array.isArray(context.variantExpectationErrors)
    ? context.variantExpectationErrors.length
    : 0;
  return {
    importMode: toNonEmptyString(context.importMode) || "full",
    importedCount: toNonNegativeFiniteInt(context.importedCount, 0),
    missingMainProofSlugs: Array.isArray(context.missingMainProofSlugs)
      ? (context.missingMainProofSlugs as string[])
      : [],
    totalMissingMainProofs: toNonNegativeFiniteInt(context.totalMissingMainProofs, mainFallbackCount),
    missingVariantProofSlugs: Array.isArray(context.missingVariantProofSlugs)
      ? (context.missingVariantProofSlugs as Array<{ slug: string; missingVariants: string[] }>)
      : [],
    totalMissingVariantProofs: toNonNegativeFiniteInt(context.totalMissingVariantProofs, variantsFallbackCount),
    variantExpectationErrors: Array.isArray(context.variantExpectationErrors)
      ? (context.variantExpectationErrors as Array<{ slug: string; reason: string }>)
      : [],
    totalVariantExpectationErrors: toNonNegativeFiniteInt(
      context.totalVariantExpectationErrors,
      expectationFallbackCount,
    ),
  };
}

export function formatProofErrorMessage(ctx: ProofErrorContext): string {
  const parts: string[] = [];
  parts.push(`Import failed: required screenshots missing (${ctx.importedCount} component${ctx.importedCount === 1 ? "" : "s"} processed).`);
  if (ctx.totalMissingMainProofs > 0) {
    const count = ctx.totalMissingMainProofs;
    parts.push(`${count} component${count === 1 ? "" : "s"} missing main screenshot: ${ctx.missingMainProofSlugs.slice(0, 5).join(", ")}${count > 5 ? ` and ${count - 5} more` : ""}.`);
  }
  if (ctx.totalMissingVariantProofs > 0) {
    const count = ctx.totalMissingVariantProofs;
    parts.push(`${count} component${count === 1 ? "" : "s"} missing variant screenshots: ${ctx.missingVariantProofSlugs.slice(0, 3).map(v => `${v.slug} (${v.missingVariants.slice(0, 2).join(", ")})`).join(", ")}${count > 3 ? ` and ${count - 3} more` : ""}.`);
  }
  if (ctx.totalVariantExpectationErrors > 0) {
    const count = ctx.totalVariantExpectationErrors;
    parts.push(`${count} component${count === 1 ? "" : "s"} could not resolve variant expectations: ${ctx.variantExpectationErrors.slice(0, 3).map(v => v.slug).join(", ")}${count > 3 ? ` and ${count - 3} more` : ""}.`);
  }
  parts.push("Re-open the Figma plugin, capture missing screenshots, and retry.");
  return parts.join(" ");
}
