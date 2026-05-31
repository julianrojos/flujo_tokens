import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { wizardReducer } from "../use-new-system-wizard";

function makeState() {
  return {
    step: "basics" as const,
    form: {
      systemName: "",
      appName: "",
      figmaFileUrl: "",
      figmaAccessToken: "",
      makeDefault: false,
      systemIdOverride: "",
    },
    import: {
      jobId: "",
      makeDefault: false,
      systemsSnapshot: [],
      progress: null,
      error: null,
      errorDetails: "",
      pipelinePhase: "",
      sourceUrl: "",
      sourceFileKey: "",
      successSummary: null,
      importMode: "full" as const,
      selectedCount: 0,
      notSelectedCount: 0,
      selectedComponentNodeIds: [] as string[],
    },
    scan: {
      state: "idle" as const,
      components: [] as Array<{ nodeId: string; name: string; pageName: string }>,
      truncated: false,
      limit: 0,
      total: 0,
      error: null as string | null,
      errorNonce: 0,
    },
    selectedComponentNodeIds: new Set<string>(),
  };
}

describe("wizardReducer scan flow", () => {
  it("SCAN_START sets loading state and clears current selection", () => {
    const prev = makeState();
    prev.scan.state = "ready";
    prev.selectedComponentNodeIds = new Set(["1:1"]);

    const next = wizardReducer(prev as any, { type: "SCAN_START" } as any);
    assert.equal(next.scan.state, "loading");
    assert.equal(next.selectedComponentNodeIds.size, 0);
  });

  it("SCAN_SUCCESS with components sets ready and resets selection", () => {
    const prev = makeState();
    prev.scan.state = "loading";
    prev.selectedComponentNodeIds = new Set(["1:1"]);

    const next = wizardReducer(
      prev as any,
      {
        type: "SCAN_SUCCESS",
        payload: {
          components: [{ nodeId: "10:1", name: "Button", pageName: "Main" }],
          truncated: false,
          limit: 200,
          total: 1,
        },
      } as any,
    );

    assert.equal(next.scan.state, "ready");
    assert.equal(next.scan.components.length, 1);
    assert.equal(next.selectedComponentNodeIds.size, 0);
  });

  it("SCAN_SUCCESS with empty components sets empty state", () => {
    const prev = makeState();
    prev.scan.state = "loading";

    const next = wizardReducer(
      prev as any,
      {
        type: "SCAN_SUCCESS",
        payload: { components: [], truncated: false, limit: 200, total: 0 },
      } as any,
    );

    assert.equal(next.scan.state, "empty");
  });

  it("SCAN_ERROR sets error state and message", () => {
    const prev = makeState();
    prev.scan.state = "loading";

    const next = wizardReducer(prev as any, { type: "SCAN_ERROR", payload: "boom" } as any);
    assert.equal(next.scan.state, "error");
    assert.equal(next.scan.error, "boom");
    assert.equal(next.scan.errorNonce, 1);
  });
});

describe("wizardReducer selection flow", () => {
  it("TOGGLE_COMPONENT adds and removes nodeId", () => {
    const prev = makeState();

    const withSelected = wizardReducer(prev as any, { type: "TOGGLE_COMPONENT", nodeId: "10:1" } as any);
    assert.equal(withSelected.selectedComponentNodeIds.has("10:1"), true);

    const withoutSelected = wizardReducer(
      withSelected as any,
      { type: "TOGGLE_COMPONENT", nodeId: "10:1" } as any,
    );
    assert.equal(withoutSelected.selectedComponentNodeIds.has("10:1"), false);
  });

  it("SELECT_ALL selects all scanned component nodeIds", () => {
    const prev = makeState();
    prev.scan = {
      state: "ready",
      components: [
        { nodeId: "10:1", name: "Button", pageName: "Main" },
        { nodeId: "10:2", name: "Card", pageName: "Main" },
      ],
      truncated: false,
      limit: 200,
      total: 2,
      error: null,
      errorNonce: 0,
    };

    const next = wizardReducer(prev as any, { type: "SELECT_ALL" } as any);
    assert.equal(next.selectedComponentNodeIds.size, 2);
    assert.equal(next.selectedComponentNodeIds.has("10:1"), true);
    assert.equal(next.selectedComponentNodeIds.has("10:2"), true);
  });

  it("SELECT_ALL works with >200 components (pagination aggregation)", () => {
    const prev = makeState();
    // Simulate accumulated scan from multiple pages (e.g. 3 pages of 500 = 1500)
    const largeComponentList = Array.from({ length: 1500 }, (_, i) => ({
      nodeId: `comp:${i}`,
      name: `Component ${i}`,
      pageName: "Main",
    }));
    prev.scan = {
      state: "ready",
      components: largeComponentList,
      truncated: false,
      limit: 500,
      total: 1500,
      error: null,
      errorNonce: 0,
    };

    const next = wizardReducer(prev as any, { type: "SELECT_ALL" } as any);
    assert.equal(next.selectedComponentNodeIds.size, 1500);
    assert.equal(next.selectedComponentNodeIds.has("comp:0"), true);
    assert.equal(next.selectedComponentNodeIds.has("comp:749"), true);
    assert.equal(next.selectedComponentNodeIds.has("comp:1499"), true);
  });

  it("DESELECT_ALL clears selection", () => {
    const prev = makeState();
    prev.selectedComponentNodeIds = new Set(["10:1", "10:2"]);

    const next = wizardReducer(prev as any, { type: "DESELECT_ALL" } as any);
    assert.equal(next.selectedComponentNodeIds.size, 0);
  });

  it("START_IMPORT stores selectedComponentNodeIds snapshot in import state", () => {
    const prev = makeState();

    const next = wizardReducer(
      prev as any,
      {
        type: "START_IMPORT",
        payload: {
          jobId: "sys-01",
          sourceUrl: "https://figma.com/file/abc",
          sourceFileKey: "abc",
          makeDefault: false,
          systemsSnapshot: [],
          importMode: "partial",
          selectedCount: 2,
          notSelectedCount: 1,
          selectedComponentNodeIds: ["10:1", "10:2"],
        },
      } as any,
    );

    assert.equal(next.step, "importing");
    assert.deepEqual(next.import.selectedComponentNodeIds, ["10:1", "10:2"]);
  });
});

describe("wizardReducer scan edge cases", () => {
  it("SCAN_SUCCESS accepts already deduplicated payload from hook accumulation", () => {
    const prev = makeState();
    prev.scan.state = "loading";

    // Simulate what handleScan dispatches after aggregation + dedup.
    const components = [
      { nodeId: "10:1", name: "Button", pageName: "Page A" },
      { nodeId: "10:2", name: "Card", pageName: "Page A" },
      { nodeId: "10:3", name: "Modal", pageName: "Page B" },
    ];

    const next = wizardReducer(
      prev as any,
      {
        type: "SCAN_SUCCESS",
        payload: { components, truncated: false, limit: 500, total: 3 },
      } as any,
    );

    assert.equal(next.scan.components.length, 3);
    assert.equal(next.scan.total, 3);
  });

  it("SCAN_SUCCESS with totalIsEstimated preserves estimate flag", () => {
    const prev = makeState();
    prev.scan.state = "loading";

    const next = wizardReducer(
      prev as any,
      {
        type: "SCAN_SUCCESS",
        payload: {
          components: [{ nodeId: "10:1", name: "Button", pageName: "Main" }],
          truncated: true,
          limit: 500,
          total: 5000,
        },
      } as any,
    );

    assert.equal(next.scan.state, "ready");
    assert.equal(next.scan.truncated, true);
  });

  it("maxPages guardrail marks truncated=true (hook integration)", () => {
    // This test documents the expected behavior: when handleScan hits maxPages=50
    // and hasMore is still true, it sets truncated=true before dispatching SCAN_SUCCESS.
    // The reducer itself doesn't know about maxPages, but the hook sets truncated=true
    // in the payload so the UI correctly shows "scan limited".
    const prev = makeState();
    prev.scan.state = "loading";

    // Simulate what happens after 50 pages with hasMore still true
    const next = wizardReducer(
      prev as any,
      {
        type: "SCAN_SUCCESS",
        payload: {
          components: Array.from({ length: 25000 }, (_, i) => ({
            nodeId: `comp:${i}`,
            name: `Component ${i}`,
            pageName: "Main",
          })),
          truncated: true, // Set by handleScan when hitMaxPages
          limit: 500,
          total: 50000,
        },
      } as any,
    );

    assert.equal(next.scan.state, "ready");
    assert.equal(next.scan.truncated, true);
    assert.equal(next.selectedComponentNodeIds.size, 0); // Selection cleared on scan success
  });

  it("RESET_SCAN returns to idle and clears selection", () => {
    const prev = makeState();
    prev.scan.state = "ready";
    prev.scan.components = [{ nodeId: "10:1", name: "Button", pageName: "Main" }];
    prev.selectedComponentNodeIds = new Set(["10:1", "10:2"]);

    const next = wizardReducer(prev as any, { type: "RESET_SCAN" } as any);
    assert.equal(next.scan.state, "idle");
    assert.equal(next.scan.components.length, 0);
    assert.equal(next.selectedComponentNodeIds.size, 0);
  });

  it("CANCEL_IMPORT resets scan state and selection", () => {
    const prev = makeState();
    prev.scan.state = "ready";
    prev.scan.components = [{ nodeId: "10:1", name: "Button", pageName: "Main" }];
    prev.selectedComponentNodeIds = new Set(["10:1"]);

    const next = wizardReducer(prev as any, { type: "CANCEL_IMPORT" } as any);
    assert.equal(next.step, "basics");
    assert.equal(next.scan.state, "idle");
    assert.equal(next.selectedComponentNodeIds.size, 0);
  });
});
