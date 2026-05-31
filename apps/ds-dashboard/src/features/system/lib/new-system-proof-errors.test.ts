import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { ApiError } from "@/lib/api";
import {
  extractProofErrorContext,
  formatProofErrorMessage,
} from "./new-system-proof-errors";

describe("new-system-proof-errors", () => {
  it("extracts context from direct structured payload", () => {
    const error = new ApiError({
      status: 409,
      statusText: "Conflict",
      code: "queue.job_failed_or_cancelled",
      userMessage: "failed",
      recoverable: true,
      payload: {
        code: "sync.component_proofs_required_failed",
        context: {
          importMode: "partial",
          importedCount: 2,
          missingMainProofSlugs: ["button"],
          missingVariantProofSlugs: [],
          totalMissingMainProofs: 1,
          totalMissingVariantProofs: 0,
          variantExpectationErrors: [],
          totalVariantExpectationErrors: 0,
        },
      },
    });

    const ctx = extractProofErrorContext(error);
    assert.ok(ctx);
    assert.equal(ctx.importMode, "partial");
    assert.deepEqual(ctx.missingMainProofSlugs, ["button"]);
  });

  it("extracts context from queue-wrapped payload (job.result.payload)", () => {
    const error = new ApiError({
      status: 409,
      statusText: "Conflict",
      code: "queue.job_failed_or_cancelled",
      userMessage: "failed",
      recoverable: true,
      payload: {
        job: {
          result: {
            payload: {
              code: "sync.component_proofs_required_failed",
              context: {
                importMode: "full",
                importedCount: 1,
                missingMainProofSlugs: [],
                missingVariantProofSlugs: [
                  { slug: "button", missingVariants: ["state secondary"] },
                ],
                totalMissingMainProofs: 0,
                totalMissingVariantProofs: 1,
                variantExpectationErrors: [],
                totalVariantExpectationErrors: 0,
              },
            },
          },
        },
      },
    });

    const ctx = extractProofErrorContext(error);
    assert.ok(ctx);
    assert.equal(ctx.importMode, "full");
    assert.equal(ctx.missingVariantProofSlugs.length, 1);
    assert.equal(ctx.missingVariantProofSlugs[0]?.slug, "button");
  });

  it("formats actionable summary message", () => {
    const text = formatProofErrorMessage({
      importMode: "partial",
      importedCount: 3,
      missingMainProofSlugs: ["button", "card"],
      totalMissingMainProofs: 2,
      missingVariantProofSlugs: [{ slug: "button", missingVariants: ["state secondary"] }],
      totalMissingVariantProofs: 1,
      variantExpectationErrors: [],
      totalVariantExpectationErrors: 0,
    });

    assert.match(text, /Import failed: required screenshots missing/i);
    assert.match(text, /missing main screenshot/i);
    assert.match(text, /missing variant screenshots/i);
    assert.match(text, /retry/i);
  });

  it("prefers total counters when payload lists are truncated", () => {
    const text = formatProofErrorMessage({
      importMode: "full",
      importedCount: 120,
      missingMainProofSlugs: ["button", "card", "input", "chip", "tag"],
      totalMissingMainProofs: 87,
      missingVariantProofSlugs: [],
      totalMissingVariantProofs: 0,
      variantExpectationErrors: [],
      totalVariantExpectationErrors: 0,
    });

    assert.match(text, /87 components missing main screenshot/i);
    assert.match(text, /and 82 more/i);
  });

  it("keeps explicit zero totals instead of falling back to list lengths", () => {
    const error = new ApiError({
      status: 409,
      statusText: "Conflict",
      code: "queue.job_failed_or_cancelled",
      userMessage: "failed",
      recoverable: true,
      payload: {
        code: "sync.component_proofs_required_failed",
        context: {
          importMode: "full",
          importedCount: 1,
          missingMainProofSlugs: ["button"],
          totalMissingMainProofs: 0,
          missingVariantProofSlugs: [{ slug: "button", missingVariants: ["state secondary"] }],
          totalMissingVariantProofs: 0,
          variantExpectationErrors: [{ slug: "button", reason: "n/a" }],
          totalVariantExpectationErrors: 0,
        },
      },
    });

    const ctx = extractProofErrorContext(error);
    assert.ok(ctx);
    assert.equal(ctx.totalMissingMainProofs, 0);
    assert.equal(ctx.totalMissingVariantProofs, 0);
    assert.equal(ctx.totalVariantExpectationErrors, 0);
  });
});
