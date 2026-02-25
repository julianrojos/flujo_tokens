import assert from "node:assert/strict";
import test from "node:test";

import { parseFigmaUrl, resolveFigmaSource } from "./spec-source.mjs";

test("spec-source: parseFigmaUrl extracts file key and node id from search params", () => {
  const parsed = parseFigmaUrl(
    "https://www.figma.com/design/FILE123/Components?node-id=123-456",
  );

  assert.deepEqual(parsed, {
    fileKey: "FILE123",
    nodeId: "123:456",
  });
});

test("spec-source: parseFigmaUrl extracts node id from hash params", () => {
  const parsed = parseFigmaUrl(
    "https://www.figma.com/file/FILE999/Name#node-id=9-10",
  );

  assert.deepEqual(parsed, {
    fileKey: "FILE999",
    nodeId: "9:10",
  });
});

test("spec-source: parseFigmaUrl returns empty values for invalid urls", () => {
  const parsed = parseFigmaUrl("not-a-url");
  assert.deepEqual(parsed, { fileKey: "", nodeId: "" });
});

test("spec-source: resolveFigmaSource throws if no source provided", () => {
  assert.throws(
    () => resolveFigmaSource({ figmaUrl: "", explicitNodeId: "", rawComponentName: "" }),
    /Missing Figma source/
  );
});

test("spec-source: resolveFigmaSource resolves with valid figmaUrl", () => {
  const resolved = resolveFigmaSource({
    figmaUrl: "https://www.figma.com/design/FILE123/Components?node-id=123-456",
    explicitNodeId: "",
    rawComponentName: ""
  });
  
  assert.deepEqual(resolved, {
    fileKeyFromUrl: "FILE123",
    nodeId: "123:456"
  });
});

test("spec-source: resolveFigmaSource resolves with explicit nodeId", () => {
  const resolved = resolveFigmaSource({
    figmaUrl: "",
    explicitNodeId: "9:10",
    rawComponentName: ""
  });
  
  assert.deepEqual(resolved, {
    fileKeyFromUrl: "",
    nodeId: "9:10"
  });
});

test("spec-source: resolveFigmaSource prioritizes explicit nodeId over figmaUrl nodeId", () => {
  const resolved = resolveFigmaSource({
    figmaUrl: "https://www.figma.com/design/FILE123/Components?node-id=123-456",
    explicitNodeId: "9:10",
    rawComponentName: ""
  });
  
  assert.deepEqual(resolved, {
    fileKeyFromUrl: "FILE123",
    nodeId: "9:10"
  });
});
