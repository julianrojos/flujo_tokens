import assert from "node:assert/strict";
import test from "node:test";

import {
  backendAllowedOrigins,
  mergeCommaSeparatedValues,
} from "./split-preview.mjs";

test("mergeCommaSeparatedValues trims and deduplicates entries", () => {
  const merged = mergeCommaSeparatedValues(
    " https://a.example , http://localhost:4173 ",
    "http://dashboard.example",
    "https://a.example",
  );

  assert.equal(
    merged,
    "https://a.example, http://localhost:4173, http://dashboard.example",
  );
});

test("backendAllowedOrigins keeps the preview origin and any configured allowlist", () => {
  const original = process.env.DS_DASHBOARD_ALLOWED_ORIGINS;
  try {
    process.env.DS_DASHBOARD_ALLOWED_ORIGINS =
      "https://dashboard.example, https://admin.example";

    const merged = backendAllowedOrigins("http://127.0.0.1:4173", 4173);

    assert.equal(
      merged,
      "https://dashboard.example, https://admin.example, http://127.0.0.1:4173, http://localhost:4173",
    );
  } finally {
    if (typeof original === "undefined") {
      delete process.env.DS_DASHBOARD_ALLOWED_ORIGINS;
    } else {
      process.env.DS_DASHBOARD_ALLOWED_ORIGINS = original;
    }
  }
});
