import assert from "node:assert/strict";
import test from "node:test";

import {
  ensureKnownSystemId,
  parseOperationsHistoryFilters,
  parseOperationsRegressionFilters,
  parseOperationsReplayRequest,
} from "./operations-route-service.mjs";

test("operations-route-service: ensureKnownSystemId validates system existence", () => {
  const config = { systems: [{ id: "core" }, { id: "brand" }] };
  assert.equal(ensureKnownSystemId({ config, systemId: "" }).ok, true);
  assert.equal(ensureKnownSystemId({ config, systemId: "core" }).ok, true);
  const invalid = ensureKnownSystemId({ config, systemId: "missing" });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error.args.code, "system.invalid_or_missing");
});

test("operations-route-service: parseOperationsHistoryFilters validates date range", () => {
  const parsed = parseOperationsHistoryFilters({
    systemFromQuery: "core",
    systemFromHeader: "",
    includeAll: false,
    operation: "sync",
    status: "SUCCESS",
    from: "2026-02-25",
    to: "2026-02-24",
    limitRaw: "9999",
    toFiniteTimestampFn: (value) => Date.parse(value),
    historyMaxLimit: 500,
    historyDefaultLimit: 100,
  });
  assert.equal(parsed.ok, false);
  assert.equal(parsed.error.args.code, "validation.invalid_date_range");
});

test("operations-route-service: parseOperationsRegressionFilters clamps values", () => {
  const parsed = parseOperationsRegressionFilters({
    systemFromQuery: "",
    systemFromHeader: "core",
    includeAll: false,
    limitRaw: "1",
    minSamplesRaw: "99",
    regressionMaxLimit: 500,
    regressionDefaultLimit: 300,
    regressionDefaultMinSamples: 4,
  });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.filters.systemId, "core");
  assert.equal(parsed.filters.limit, 20);
  assert.equal(parsed.filters.minSamples, 20);
});

test("operations-route-service: parseOperationsReplayRequest resolves source and target system", () => {
  const parsed = parseOperationsReplayRequest({
    eventIdRaw: "op_123",
    bodySystemIdRaw: "",
    headerSystemId: "core",
    normalizeSystemIdFn: (value) => String(value || "").trim(),
    findOperationEventByIdFn: () => ({
      event: {
        operation: "script:ds:registry:refresh",
        system: "core",
      },
      scannedRows: 12,
    }),
    config: { systems: [{ id: "core" }] },
  });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.payload.eventId, "op_123");
  assert.equal(parsed.payload.targetSystemId, "core");
});
