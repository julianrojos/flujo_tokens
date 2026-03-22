import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildPhaseAwareError,
  extractCaptureFigmaErrorDetail,
  extractCapturePipelinePhase,
  extractPhaseAwareCaptureFigmaError,
  formatCaptureFigmaErrorMessage,
  toPipelinePhaseFromError,
} from "../src/features/system/new-system-import-errors";

describe("new-system import modal error helpers", () => {
  it("extracts figma error and pipeline phase from queued job payload", () => {
    const payload = {
      job: {
        result: {
          payload: {
            pipeline_phase: "token_sync",
            figma_error: {
              status: 404,
              fileKey: "abc123",
              endpoint: "https://api.figma.com/v1/files/abc123",
              message: "Figma API error 404",
            },
          },
        },
      },
    };

    const figmaError = extractCaptureFigmaErrorDetail(payload);
    const phase = extractCapturePipelinePhase(payload);

    assert.equal(phase, "token_sync");
    assert.equal(figmaError?.status, 404);
    assert.equal(figmaError?.fileKey, "abc123");
  });

  it("keeps figma_error on phase-aware thrown errors for modal rendering", () => {
    const error = buildPhaseAwareError({
      message: "Initial Figma import failed.",
      pipelinePhase: "resolve_context",
      figmaError: {
        status: 403,
        fileKey: "file123",
        endpoint: "https://api.figma.com/v1/files/file123",
      },
    });

    const figmaError = extractPhaseAwareCaptureFigmaError(error);
    const phase = toPipelinePhaseFromError(error);

    assert.equal(phase, "resolve_context");
    assert.equal(figmaError?.status, 403);
    assert.equal(figmaError?.fileKey, "file123");
  });

  it("formats actionable message for figma 404", () => {
    const message = formatCaptureFigmaErrorMessage({
      status: 404,
      fileKey: "wrongKey",
    });

    assert.match(message, /404/i);
    assert.match(message, /wrongKey/);
  });
});
