import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WizardStepBasics } from "../wizard-step-basics";

// Minimal stubs for shadcn components
jestStubComponents();

function jestStubComponents() {
  // No-op since we render to static markup without external deps
}

describe("WizardStepBasics", () => {
  const defaultProps = {
    form: {
      systemName: "Test System",
      appName: "",
      figmaFileUrl: "https://www.figma.com/file/ABC123/Test",
      figmaAccessToken: "test-token",
      compileVariablesOnCapture: true,
      makeDefault: false,
      systemIdOverride: "",
    },
    derived: {
      generatedSystemId: "test-system",
      figmaFileId: "ABC123",
      isFormValid: true,
      saving: false,
      scanState: "idle" as const,
      scanComponents: [],
      scanTruncated: false,
      scanTotal: 0,
      scanLimit: 0,
      scanError: null,
      selectedIds: new Set<string>(),
      canSelectAll: false,
      hasSelection: false,
    },
    actions: {
      onFieldChange: () => {},
      onScan: () => {},
      onImport: () => {},
      onToggleComponent: () => {},
      onSelectAll: () => {},
      onDeselectAll: () => {},
    },
  };

  it("renders Scan file button when scanState is idle", () => {
    const html = renderToStaticMarkup(
      React.createElement(WizardStepBasics, defaultProps),
    );

    assert.match(html, /Scan file/);
  });

  it("shows scanning state when scanState is loading", () => {
    const html = renderToStaticMarkup(
      React.createElement(WizardStepBasics, {
        ...defaultProps,
        derived: {
          ...defaultProps.derived,
          scanState: "loading" as const,
        },
      }),
    );

    assert.match(html, /Scanning/);
  });

  it("disables Import Design System when scanState is not ready", () => {
    const html = renderToStaticMarkup(
      React.createElement(WizardStepBasics, {
        ...defaultProps,
        derived: {
          ...defaultProps.derived,
          scanState: "idle" as const,
        },
      }),
    );

    assert.match(html, /disabled/);
    assert.match(html, /Scan first/);
  });

  it("shows empty state when scan returns no components", () => {
    const html = renderToStaticMarkup(
      React.createElement(WizardStepBasics, {
        ...defaultProps,
        derived: {
          ...defaultProps.derived,
          scanState: "empty" as const,
        },
      }),
    );

    assert.match(html, /No components found/);
  });

  it("shows error state with retry button", () => {
    const html = renderToStaticMarkup(
      React.createElement(WizardStepBasics, {
        ...defaultProps,
        derived: {
          ...defaultProps.derived,
          scanState: "error" as const,
          scanError: "Connection failed",
        },
      }),
    );

    assert.match(html, /Connection failed/);
    assert.match(html, /Try again/);
  });

  it("disables Select all when truncated", () => {
    const html = renderToStaticMarkup(
      React.createElement(WizardStepBasics, {
        ...defaultProps,
        derived: {
          ...defaultProps.derived,
          scanState: "ready" as const,
          scanComponents: [
            { nodeId: "10:1", name: "Button", pageName: "Components" },
          ],
          scanTruncated: true,
          scanTotal: 500,
          scanLimit: 200,
          canSelectAll: false,
        },
      }),
    );

    assert.match(html, /disabled.*truncated/);
  });

  it("enables Import Design System when scanState is ready", () => {
    const html = renderToStaticMarkup(
      React.createElement(WizardStepBasics, {
        ...defaultProps,
        derived: {
          ...defaultProps.derived,
          scanState: "ready" as const,
          scanComponents: [
            { nodeId: "10:1", name: "Button", pageName: "Components" },
          ],
          canSelectAll: true,
        },
      }),
    );

    assert.match(html, /Import Design System/);
    // Should NOT be disabled when form is valid and scan is ready
    assert.doesNotMatch(html, /Scan first/);
  });

  it("disables Import Design System when no components selected", () => {
    const html = renderToStaticMarkup(
      React.createElement(WizardStepBasics, {
        ...defaultProps,
        derived: {
          ...defaultProps.derived,
          scanState: "ready" as const,
          scanComponents: [
            { nodeId: "10:1", name: "Button", pageName: "Components" },
          ],
          canSelectAll: true,
          hasSelection: false,
        },
      }),
    );

    // Import button should be disabled when hasSelection is false
    assert.match(html, /Import Design System/);
    assert.match(html, /disabled/);
  });

  it("groups components by pageName", () => {
    const html = renderToStaticMarkup(
      React.createElement(WizardStepBasics, {
        ...defaultProps,
        derived: {
          ...defaultProps.derived,
          scanState: "ready" as const,
          scanComponents: [
            { nodeId: "10:1", name: "Button", pageName: "Components" },
            { nodeId: "10:2", name: "Modal", pageName: "Overlays" },
          ],
          canSelectAll: true,
        },
      }),
    );

    assert.match(html, /Components/);
    assert.match(html, /Overlays/);
    assert.match(html, /Button/);
    assert.match(html, /Modal/);
  });
});
