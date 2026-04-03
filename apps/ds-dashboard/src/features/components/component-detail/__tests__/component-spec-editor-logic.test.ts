import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PartialComponentSpec } from "ds-types";
import {
  buildEditorialPayload,
  isSummaryDirty,
  isBestPracticesDirty,
  isContentGuidelinesDirty,
  isAccessibilityDirty,
  persistEditorial,
  persistSummaryEditorial,
  toBestPractices,
  toContentGuidelines,
  toAccessibility,
  type SummaryFields,
  type BestPracticesFields,
  type ContentGuidelinesFields,
  type AccessibilityFields,
} from "../component-spec-editor-logic";

function makeBaseline(overrides?: {
  summary?: SummaryFields;
  bestPractices?: BestPracticesFields;
  contentGuidelines?: ContentGuidelinesFields;
  accessibility?: AccessibilityFields;
  spec?: PartialComponentSpec;
}) {
  return {
    summary: { purpose: "", when_to_use: "", when_not_to_use: "" },
    baselineSummary: { purpose: "", when_to_use: "", when_not_to_use: "" },
    bestPractices: { do: [], dont: [] },
    baselineBestPractices: { do: [], dont: [] },
    contentGuidelines: { rules: [] },
    baselineContentGuidelines: { rules: [] },
    accessibility: { role: "", labelingRules: [] },
    baselineAccessibility: { role: "", labelingRules: [] },
    spec: null as PartialComponentSpec | null,
    ...overrides,
  };
}

describe("isSummaryDirty", () => {
  it("returns false for newline normalization differences", () => {
    const current = {
      purpose: "Purpose with CRLF\r\n",
      when_to_use: "Use in forms\n",
      when_not_to_use: "Avoid for display-only content\r\n",
    };
    const baseline = {
      purpose: "Purpose with CRLF",
      when_to_use: "Use in forms",
      when_not_to_use: "Avoid for display-only content",
    };
    assert.strictEqual(isSummaryDirty(current, baseline), false);
  });

  it("returns true when leading or trailing spaces are edited", () => {
    const current = { purpose: " Purpose", when_to_use: "B", when_not_to_use: "C " };
    const baseline = { purpose: "Purpose", when_to_use: "B", when_not_to_use: "C" };
    assert.strictEqual(isSummaryDirty(current, baseline), true);
  });

  it("returns true for real summary content changes", () => {
    const current = { purpose: "A", when_to_use: "B", when_not_to_use: "C" };
    const baseline = { purpose: "A", when_to_use: "B changed", when_not_to_use: "C" };
    assert.strictEqual(isSummaryDirty(current, baseline), true);
  });
});

describe("buildEditorialPayload", () => {
  it("returns {} when all groups are clean", () => {
    const result = buildEditorialPayload(makeBaseline());
    assert.deepStrictEqual(result, {});
  });

  it("returns only summary when only summary is dirty", () => {
    const args = makeBaseline({
      summary: { purpose: "New purpose", when_to_use: "", when_not_to_use: "" },
    });
    const result = buildEditorialPayload(args);
    assert.deepStrictEqual(result, {
      summary: { purpose: "New purpose", when_to_use: "", when_not_to_use: "" },
    });
    assert.ok(!("best_practices" in result));
    assert.ok(!("content_guidelines" in result));
    assert.ok(!("accessibility" in result));
  });

  it("includes best_practices when dirty with items", () => {
    const args = makeBaseline({
      bestPractices: { do: ["Use semantic HTML"], dont: ["Use divs for buttons"] },
    });
    const result = buildEditorialPayload(args);
    assert.ok("best_practices" in result);
    assert.deepStrictEqual(result.best_practices, {
      do: ["Use semantic HTML"],
      dont: ["Use divs for buttons"],
    });
  });

  it("does NOT include best_practices when all items are empty after trim (Option A)", () => {
    const args = makeBaseline({
      bestPractices: { do: ["  ", ""], dont: ["   "] },
    });
    const result = buildEditorialPayload(args);
    assert.ok(!("best_practices" in result));
  });

  it("preserves focus/hit_area when accessibility is dirty with baseline data", () => {
    const spec: PartialComponentSpec = {
      accessibility: {
        role: "button",
        focus: { tokens: { inner: "--focus-inner", outer: "--focus-outer" } },
        hit_area: { desktop_token: "--hit-desktop", mobile_token: "--hit-mobile" },
        labeling: { rules: ["old rule"] },
      },
    };
    const args = makeBaseline({
      spec,
      accessibility: { role: "dialog", labelingRules: ["new rule"] },
      baselineAccessibility: { role: "button", labelingRules: ["old rule"] },
    });
    const result = buildEditorialPayload(args);
    assert.ok("accessibility" in result);
    const acc = result.accessibility as Record<string, unknown>;
    assert.strictEqual(acc.role, "dialog");
    assert.deepStrictEqual(acc.focus, {
      tokens: { inner: "--focus-inner", outer: "--focus-outer" },
    });
    assert.deepStrictEqual(acc.hit_area, {
      desktop_token: "--hit-desktop",
      mobile_token: "--hit-mobile",
    });
    assert.deepStrictEqual(acc.labeling, { rules: ["new rule"] });
  });

  it("preserves all known non-editable accessibility fields (focus, hit_area) when editing role and labeling", () => {
    const spec: PartialComponentSpec = {
      accessibility: {
        role: "button",
        focus: { tokens: { inner: "--focus-inner", outer: "--focus-outer" } },
        hit_area: { desktop_token: "--hit-desktop", mobile_token: "--hit-mobile" },
        labeling: { rules: ["old rule"] },
      },
    };
    const args = makeBaseline({
      spec,
      accessibility: { role: "dialog", labelingRules: ["new rule"] },
      baselineAccessibility: { role: "button", labelingRules: ["old rule"] },
    });
    const result = buildEditorialPayload(args);
    const acc = result.accessibility as Record<string, unknown>;
    assert.strictEqual(acc.role, "dialog");
    assert.deepStrictEqual(acc.focus, { tokens: { inner: "--focus-inner", outer: "--focus-outer" } });
    assert.deepStrictEqual(acc.hit_area, { desktop_token: "--hit-desktop", mobile_token: "--hit-mobile" });
    assert.deepStrictEqual(acc.labeling, { rules: ["new rule"] });
  });

  it("does not invent focus when spec has no focus", () => {
    const spec: PartialComponentSpec = {
      accessibility: {
        role: "button",
        labeling: { rules: ["old"] },
      },
    };
    const args = makeBaseline({
      spec,
      accessibility: { role: "dialog", labelingRules: ["new"] },
      baselineAccessibility: { role: "button", labelingRules: ["old"] },
    });
    const result = buildEditorialPayload(args);
    const acc = result.accessibility as Record<string, unknown>;
    assert.ok(!("focus" in acc) || acc.focus === undefined);
    assert.ok(!("hit_area" in acc) || acc.hit_area === undefined);
  });

  it("sends accessibility when role has value but labelingRules is empty", () => {
    const spec: PartialComponentSpec = {
      accessibility: {
        role: "button",
        focus: { tokens: { inner: "--focus" } },
      },
    };
    const args = makeBaseline({
      spec,
      accessibility: { role: "main", labelingRules: [] },
      baselineAccessibility: { role: "button", labelingRules: [] },
    });
    const result = buildEditorialPayload(args);
    assert.ok("accessibility" in result);
    const acc = result.accessibility as Record<string, unknown>;
    assert.strictEqual(acc.role, "main");
    assert.deepStrictEqual(acc.focus, { tokens: { inner: "--focus" } });
  });

  it("preserves additional accessibility fields from baseline", () => {
    const spec: PartialComponentSpec = {
      accessibility: {
        role: "button",
        focus: { tokens: { inner: "--focus" } },
        hit_area: { desktop_token: "--hit" },
        labeling: { rules: ["old"] },
      },
    };
    const specWithServerFields = {
      ...spec,
      accessibility: {
        ...(spec.accessibility ?? {}),
        complianceScore: 91,
        _lastSyncedAt: "2026-01-01T00:00:00Z",
      },
    } as PartialComponentSpec;

    const args = makeBaseline({
      spec: specWithServerFields,
      accessibility: { role: "dialog", labelingRules: ["new"] },
      baselineAccessibility: { role: "button", labelingRules: ["old"] },
    });
    const result = buildEditorialPayload(args);
    const acc = result.accessibility as Record<string, unknown>;
    assert.strictEqual(acc.complianceScore, 91);
    assert.strictEqual(acc._lastSyncedAt, "2026-01-01T00:00:00Z");
    assert.strictEqual(acc.role, "dialog");
    assert.deepStrictEqual(acc.focus, { tokens: { inner: "--focus" } });
    assert.deepStrictEqual(acc.hit_area, { desktop_token: "--hit" });
    assert.deepStrictEqual(acc.labeling, { rules: ["new"] });
  });

  it("does NOT include content_guidelines when all rules are empty after trim", () => {
    const args = makeBaseline({
      contentGuidelines: { rules: ["  ", ""] },
    });
    const result = buildEditorialPayload(args);
    assert.ok(!("content_guidelines" in result));
  });

  it("includes content_guidelines when rules have content", () => {
    const args = makeBaseline({
      contentGuidelines: { rules: ["Use title case", "No trailing punctuation"] },
    });
    const result = buildEditorialPayload(args);
    assert.ok("content_guidelines" in result);
    assert.deepStrictEqual(result.content_guidelines, {
      rules: ["Use title case", "No trailing punctuation"],
    });
  });
});

describe("normalizeStringList (via dirty checks)", () => {
  it("trims and filters empty strings", () => {
    // Indirect test: dirty check should treat ["  a  "] as ["a"]
    const a = { do: ["  a  "], dont: [] };
    const b = { do: ["a"], dont: [] };
    assert.strictEqual(isBestPracticesDirty(a, b), false);
  });

  it("treats all-whitespace items as empty", () => {
    const a = { do: ["   ", ""], dont: [] };
    const b = { do: [], dont: [] };
    assert.strictEqual(isBestPracticesDirty(a, b), false);
  });

  it("detects real differences after normalization", () => {
    const a = { do: ["Do this"], dont: [] };
    const b = { do: ["Do that"], dont: [] };
    assert.strictEqual(isBestPracticesDirty(a, b), true);
  });
});

describe("isContentGuidelinesDirty", () => {
  it("returns false for identical lists", () => {
    const a = { rules: ["rule1", "rule2"] };
    const b = { rules: ["rule1", "rule2"] };
    assert.strictEqual(isContentGuidelinesDirty(a, b), false);
  });

  it("returns false for whitespace-only differences", () => {
    const a = { rules: ["  rule1  ", "rule2  "] };
    const b = { rules: ["rule1", "  rule2"] };
    assert.strictEqual(isContentGuidelinesDirty(a, b), false);
  });

  it("returns true for real differences", () => {
    const a = { rules: ["rule1"] };
    const b = { rules: ["rule2"] };
    assert.strictEqual(isContentGuidelinesDirty(a, b), true);
  });
});

describe("isAccessibilityDirty", () => {
  it("returns false when role and labelingRules match baseline", () => {
    const a = { role: "button", labelingRules: ["rule1"] };
    const b = { role: "button", labelingRules: ["rule1"] };
    assert.strictEqual(isAccessibilityDirty(a, b), false);
  });

  it("returns true when role changes", () => {
    const a = { role: "dialog", labelingRules: [] };
    const b = { role: "button", labelingRules: [] };
    assert.strictEqual(isAccessibilityDirty(a, b), true);
  });

  it("returns true when labelingRules change", () => {
    const a = { role: "", labelingRules: ["new"] };
    const b = { role: "", labelingRules: ["old"] };
    assert.strictEqual(isAccessibilityDirty(a, b), true);
  });

  it("returns false for whitespace-only role differences", () => {
    const a = { role: "  button  ", labelingRules: [] };
    const b = { role: "button", labelingRules: [] };
    assert.strictEqual(isAccessibilityDirty(a, b), false);
  });
});

describe("to* extractors", () => {
  it("toBestPractices returns empty arrays when spec has no best_practices", () => {
    const result = toBestPractices(null);
    assert.deepStrictEqual(result, { do: [], dont: [] });
  });

  it("toBestPractices copies arrays from spec", () => {
    const spec: PartialComponentSpec = {
      best_practices: { do: ["a"], dont: ["b"] },
    };
    const result = toBestPractices(spec);
    assert.deepStrictEqual(result, { do: ["a"], dont: ["b"] });
    // Verify it's a copy
    result.do.push("c");
    assert.strictEqual(spec.best_practices?.do.length, 1);
  });

  it("toContentGuidelines returns empty array when spec has no content_guidelines", () => {
    const result = toContentGuidelines(null);
    assert.deepStrictEqual(result, { rules: [] });
  });

  it("toAccessibility returns defaults when spec has no accessibility", () => {
    const result = toAccessibility(null);
    assert.deepStrictEqual(result, { role: "", labelingRules: [] });
  });

  it("toAccessibility extracts role and labeling.rules", () => {
    const spec: PartialComponentSpec = {
      accessibility: {
        role: "dialog",
        labeling: { rules: ["label1", "label2"] },
      },
    };
    const result = toAccessibility(spec);
    assert.deepStrictEqual(result, { role: "dialog", labelingRules: ["label1", "label2"] });
  });
});

describe("persistSummaryEditorial", () => {
  it("always sends summary payload through the API wrapper", async () => {
    let called = false;
    let receivedFields: Record<string, unknown> | null = null;
    const result = await persistSummaryEditorial(
      {
        slug: "button",
        expectedUpdatedAt: 42,
        summary: { purpose: "x", when_to_use: "y", when_not_to_use: "z" },
      },
      {
        patchEditorialSpecFn: async (args) => {
          called = true;
          receivedFields = args.fields;
          return {
            ok: true,
            updatedAt: 43,
            message: "saved",
            markdownSynced: true,
          };
        },
      },
    );

    assert.strictEqual(called, true);
    assert.deepStrictEqual(receivedFields, {
      summary: { purpose: "x", when_to_use: "y", when_not_to_use: "z" },
    });
    assert.deepStrictEqual(result, {
      message: "saved",
      updatedAt: 43,
      markdownSynced: true,
    });
  });

  it("throws when patchEditorialSpecFn returns ok: false", async () => {
    await assert.rejects(
      () =>
        persistSummaryEditorial(
          {
            slug: "btn",
            expectedUpdatedAt: null,
            summary: { purpose: "x", when_to_use: "", when_not_to_use: "" },
          },
          {
            patchEditorialSpecFn: async () => ({
              ok: false,
              updatedAt: null,
              message: "conflict",
            }),
          },
        ),
      /Unable|conflict/,
    );
  });
});

describe("persistEditorial", () => {
  it("returns markdownSynced: true when no fields are dirty (no-op)", async () => {
    let called = false;
    const result = await persistEditorial(
      {
        slug: "button",
        expectedUpdatedAt: 42,
        summary: { purpose: "", when_to_use: "", when_not_to_use: "" },
        baselineSummary: { purpose: "", when_to_use: "", when_not_to_use: "" },
        bestPractices: { do: [], dont: [] },
        baselineBestPractices: { do: [], dont: [] },
        contentGuidelines: { rules: [] },
        baselineContentGuidelines: { rules: [] },
        accessibility: { role: "", labelingRules: [] },
        baselineAccessibility: { role: "", labelingRules: [] },
        spec: null,
      },
      {
        patchEditorialSpecFn: async () => {
          called = true;
          return { ok: true, updatedAt: null };
        },
      },
    );

    assert.strictEqual(called, false);
    assert.strictEqual(result.markdownSynced, true);
    assert.strictEqual(result.message, "No changes to save.");
  });

  it("throws when API returns ok: true but savedKeys is incomplete", async () => {
    await assert.rejects(
      () =>
        persistEditorial(
          {
            slug: "button",
            expectedUpdatedAt: null,
            summary: { purpose: "new", when_to_use: "", when_not_to_use: "" },
            baselineSummary: { purpose: "", when_to_use: "", when_not_to_use: "" },
            bestPractices: { do: ["do this"], dont: [] },
            baselineBestPractices: { do: [], dont: [] },
            contentGuidelines: { rules: [] },
            baselineContentGuidelines: { rules: [] },
            accessibility: { role: "", labelingRules: [] },
            baselineAccessibility: { role: "", labelingRules: [] },
            spec: null,
          },
          {
            patchEditorialSpecFn: async () => ({
              ok: true,
              updatedAt: 1,
              savedKeys: ["summary"],
              message: "partial",
              markdownSynced: true,
            }),
          },
        ),
      /Fields not persisted: best_practices/,
    );
  });

  it("succeeds when savedKeys includes all sent keys", async () => {
    const result = await persistEditorial(
      {
        slug: "button",
        expectedUpdatedAt: null,
        summary: { purpose: "new", when_to_use: "", when_not_to_use: "" },
        baselineSummary: { purpose: "", when_to_use: "", when_not_to_use: "" },
        bestPractices: { do: [], dont: [] },
        baselineBestPractices: { do: [], dont: [] },
        contentGuidelines: { rules: [] },
        baselineContentGuidelines: { rules: [] },
        accessibility: { role: "", labelingRules: [] },
        baselineAccessibility: { role: "", labelingRules: [] },
        spec: null,
      },
      {
        patchEditorialSpecFn: async () => ({
          ok: true,
          updatedAt: 1,
          savedKeys: ["summary"],
          message: "saved",
          markdownSynced: true,
        }),
      },
    );

    assert.strictEqual(result.message, "saved");
    assert.strictEqual(result.markdownSynced, true);
  });
});
