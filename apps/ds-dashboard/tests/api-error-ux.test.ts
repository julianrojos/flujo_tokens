import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { ApiError } from "../src/lib/api.ts";
import { toApiErrorDisplay } from "../src/lib/api-error-ux.ts";
import { API_ERROR_CODES } from "../src/lib/api-errors.ts";

describe("toApiErrorDisplay", () => {
  it("resolves title/action for known catalog code", () => {
    const error = new ApiError({
      status: 409,
      statusText: "Conflict",
      code: API_ERROR_CODES.DESIGN_SYSTEM_ALREADY_EXISTS,
      userMessage: "System already exists.",
      recoverable: true,
    });

    const display = toApiErrorDisplay(error, {
      fallbackTitle: "Error",
      fallbackMessage: "Something went wrong.",
    });

    assert.equal(display.title, "System already exists");
    assert.equal(display.action, "Use a different ID or update the existing system.");
    assert.equal(display.retryable, true);
  });

  it("uses fallback for non-api errors", () => {
    const display = toApiErrorDisplay(new Error("Random failure"), {
      fallbackTitle: "Oops",
      fallbackMessage: "Try again.",
    });

    assert.equal(display.title, "Oops");
    assert.equal(display.message, "Random failure");
    assert.equal(display.action, "Retry the action.");
    assert.equal(display.code, null);
  });

  it("keeps validation errors non-retryable when server marks them so", () => {
    const error = new ApiError({
      status: 400,
      statusText: "Bad Request",
      code: API_ERROR_CODES.VALIDATION_MISSING_REQUIRED_FIELDS,
      userMessage: "ID is required.",
      recoverable: false,
    });

    const display = toApiErrorDisplay(error, {
      fallbackTitle: "Error",
      fallbackMessage: "Something went wrong.",
    });

    assert.equal(display.title, "Invalid request");
    assert.equal(display.retryable, false);
  });

  it("surfaces HTTP fallback metadata through action", () => {
    const error = new ApiError({
      status: 503,
      statusText: "Service Unavailable",
      code: "http.503",
      userMessage: "",
      recoverable: true,
    });

    const display = toApiErrorDisplay(error, {
      fallbackTitle: "Error",
      fallbackMessage: "Request failed.",
    });

    assert.equal(display.title, "Server error");
    assert.equal(display.message, "HTTP 503 error.");
    assert.equal(display.action, "Retry after a short delay.");
  });
});
