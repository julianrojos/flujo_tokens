import test from "node:test";
import assert from "node:assert/strict";
import { configureFigmaContext } from "./capture-figma-context.mjs";

test("capture-figma-context: ensures file payload lazily and caches it", async () => {
  let fetchCount = 0;
  const { ensureFilePayload } = configureFigmaContext({
    descriptor: { fileKey: "key" },
    figmaToken: "token",
    fetchFigmaFileFn: async () => {
      fetchCount += 1;
      return /** @type {any} */ ({ document: { id: "0:0" } });
    }
  });

  const p1 = await ensureFilePayload();
  const p2 = await ensureFilePayload();

  assert.equal(fetchCount, 1);
  assert.equal(p1.document.id, "0:0");
  assert.equal(p1, p2);
});

test("capture-figma-context: fetches nodes if nodeIdFromUrl is provided", async () => {
  let parsedNodeId = null;
  const { resolveContext } = configureFigmaContext({
    descriptor: { fileKey: "key", nodeIdFromUrl: "1:2" },
    figmaToken: "token",
    fetchFigmaNodesFn: async ({ nodeIds }) => {
      parsedNodeId = nodeIds[0];
      return /** @type {any} */ ({ nodes: { "1:2": { document: { id: "1:2", name: "Target" } } } });
    },
    extractSingleNodeCandidateFn: () => /** @type {any} */ ({ node_id: "1:2", name: "Target", kind: "component" }),
  });

  const { componentMap, singleNodeCandidate } = await resolveContext();

  assert.equal(parsedNodeId, "1:2");
  assert.equal(componentMap, null);
  assert.equal(singleNodeCandidate.name, "Target");
});

test("capture-figma-context: falls back to unknown node if node fetch fails", async () => {
  const { resolveContext } = configureFigmaContext({
    descriptor: { fileKey: "key", nodeIdFromUrl: "1:2" },
    figmaToken: "token",
    fetchFigmaNodesFn: async () => {
      throw new Error("API Limit");
    },
  });

  const { singleNodeCandidate } = await resolveContext();

  assert.equal(singleNodeCandidate.name, "1:2");
  assert.equal(singleNodeCandidate.kind, "unknown");
});

test("capture-figma-context: parses full file component map if no node id", async () => {
  const { resolveContext } = configureFigmaContext({
    descriptor: { fileKey: "key" },
    figmaToken: "token",
    fetchFigmaFileFn: async () => /** @type {any} */ ({
      document: { id: "1" },
    }),
    buildFigmaComponentMapFn: () => ({ components: [{ name: "A" }] }),
  });

  const { componentMap, singleNodeCandidate } = await resolveContext();

  assert.equal(singleNodeCandidate, null);
  assert.equal(componentMap.components[0].name, "A");
});
