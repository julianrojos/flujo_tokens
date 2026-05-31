import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ConsumerSyncStatusBadge } from "../consumer-sync-status-badge";

describe("ConsumerSyncStatusBadge", () => {
  it("renders partial status as synced without a partial label", () => {
    const html = renderToStaticMarkup(
      <ConsumerSyncStatusBadge
        latestSync={{
          id: "sync-1",
          consumerId: "consumer-1",
          syncedAt: "2026-05-20T15:50:59.156Z",
          durationMs: 1234,
          status: "partial",
          componentCount: 0,
          variableCount: 0,
          warningCount: 1,
        }}
      />,
    );

    assert.match(html, /Synced/);
    assert.doesNotMatch(html, /Partial/);
  });

  it("renders synced status as a stable label", () => {
    const html = renderToStaticMarkup(
      <ConsumerSyncStatusBadge
        latestSync={{
          id: "sync-1",
          consumerId: "consumer-1",
          syncedAt: "2026-05-20T15:50:59.156Z",
          durationMs: 1234,
          status: "ok",
          componentCount: 0,
          variableCount: 0,
          warningCount: 0,
        }}
      />,
    );

    assert.match(html, /Synced/);
  });
});
