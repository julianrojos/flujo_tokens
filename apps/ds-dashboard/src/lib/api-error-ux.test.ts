import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { toApiErrorDisplay } from "./api-error-ux";

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
});
