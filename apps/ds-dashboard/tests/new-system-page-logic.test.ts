import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  findSystemNameCollision,
  normalizeSystemNameForCollision,
  resolveSuggestedSystemName,
  suggestSystemNameFromFigmaHeartbeat,
  suggestSystemNameFromFigmaUrl,
} from "../src/features/system/new-system-page-logic";

describe("new-system-page logic", () => {
  it("normalizes names for collision checks", () => {
    assert.equal(
      normalizeSystemNameForCollision("  PatternFly   Community "),
      "patternfly community",
    );
  });

  it("detects case-insensitive collisions", () => {
    const collision = findSystemNameCollision({
      candidateName: "patternfly community",
      systems: [{ id: "pf", name: "PatternFly Community" }],
    });

    assert.equal(collision?.id, "pf");
  });

  it("returns null when there is no collision", () => {
    const collision = findSystemNameCollision({
      candidateName: "New System",
      systems: [{ id: "pf", name: "PatternFly Community" }],
    });

    assert.equal(collision, null);
  });

  it("suggests the Figma file name when the heartbeat matches the file and the field is empty", () => {
    const suggested = suggestSystemNameFromFigmaHeartbeat({
      heartbeat: {
        alive: true,
        sourceFileKey: "ABC123",
        sourceDocName: "  Design System  ",
      },
      expectedFileKey: "ABC123",
      currentSystemName: "",
    });

    assert.equal(suggested, "Design System");
  });

  it("does not suggest a name when the heartbeat file key does not match", () => {
    const suggested = suggestSystemNameFromFigmaHeartbeat({
      heartbeat: {
        alive: true,
        sourceFileKey: "XYZ999",
        sourceDocName: "Design System",
      },
      expectedFileKey: "ABC123",
      currentSystemName: "",
    });

    assert.equal(suggested, "");
  });

  it("does not overwrite a manually entered system name", () => {
    const suggested = suggestSystemNameFromFigmaHeartbeat({
      heartbeat: {
        alive: true,
        sourceFileKey: "ABC123",
        sourceDocName: "Design System",
      },
      expectedFileKey: "ABC123",
      currentSystemName: "Custom Name",
    });

    assert.equal(suggested, "");
  });

  it("suggests a readable name from the Figma URL slug when the plugin is unavailable", () => {
    const suggested = suggestSystemNameFromFigmaUrl(
      "https://www.figma.com/file/ABC123/design-system-v2?node-id=0-1",
    );

    assert.equal(suggested, "Design System V2");
  });

  it("resolveSuggestedSystemName does not overwrite a manual system name even with URL fallback", () => {
    const suggested = resolveSuggestedSystemName({
      currentSystemName: "Custom Name",
      figmaUrl: "https://www.figma.com/file/ABC123/design-system-v2?node-id=0-1",
      heartbeat: null,
      expectedFileKey: "ABC123",
    });

    assert.equal(suggested, "");
  });

  it("resolveSuggestedSystemName falls back to URL slug when heartbeat is unavailable", () => {
    const suggested = resolveSuggestedSystemName({
      currentSystemName: "",
      figmaUrl: "https://www.figma.com/file/ABC123/design-system-v2?node-id=0-1",
      heartbeat: null,
      expectedFileKey: "ABC123",
    });

    assert.equal(suggested, "Design System V2");
  });
});
