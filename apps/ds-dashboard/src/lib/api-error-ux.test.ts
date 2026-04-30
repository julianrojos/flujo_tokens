import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "./api";
import {
  resolveApiUnavailableDisplay,
  toApiErrorDisplay,
} from "./api-error-ux";

describe("toApiErrorDisplay", () => {
  it("maps fetch failures to an API unavailable message", () => {
    const result = toApiErrorDisplay(new Error("Failed to fetch"), {
      fallbackTitle: "Token data unavailable",
      fallbackMessage: "Failed to fetch",
    });

    assert.equal(result.title, "API unavailable");
    assert.match(result.message, /dashboard API is not reachable/i);
    assert.equal(result.action, "Check PostgreSQL and restart the dashboard.");
    assert.equal(result.retryable, true);
  });

  it("describes split preview failures when the frontend targets a backend URL", () => {
    const result = resolveApiUnavailableDisplay("http://127.0.0.1:8787");

    assert.match(result.message, /preview:split/i);
    assert.match(result.message, /http:\/\/127\.0\.0\.1:8787/);
    assert.equal(
      result.action,
      "Check the backend and PostgreSQL, then restart preview:split.",
    );
  });

  it("keeps generic errors on the provided fallback", () => {
    const result = toApiErrorDisplay(new Error("Boom"), {
      fallbackTitle: "Token data unavailable",
      fallbackMessage: "Failed to fetch",
    });

    assert.equal(result.title, "Token data unavailable");
    assert.equal(result.message, "Boom");
    assert.equal(result.action, "Retry the action.");
    assert.equal(result.retryable, true);
  });

  it("exposes backend reasons when present in the api error context", () => {
    const result = toApiErrorDisplay(
      new ApiError({
        status: 500,
        statusText: "Internal Server Error",
        code: "design_system.delete_failed",
        userMessage: "Failed to delete the design system.",
        recoverable: true,
        requestId: "req_123",
        context: {
          reason: "Preflight DB check failed before delete could start.",
        },
      }),
      {
        fallbackTitle: "Design system error",
        fallbackMessage: "Failed to delete the design system.",
      },
    );

    assert.equal(result.reason, "Preflight DB check failed before delete could start.");
    assert.equal(result.requestId, "req_123");
  });
});
