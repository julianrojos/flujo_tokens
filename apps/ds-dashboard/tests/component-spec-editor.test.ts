import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PartialComponentSpec } from "ds-types";
import {
  isSummaryDirty,
  persistSummaryEditorial,
  resolveCancelIntent,
  toSummary,
  type SummaryFields,
} from "../src/features/components/component-detail/component-spec-editor-logic";

describe("component-spec-editor behavior helpers", () => {
  it("toSummary maps missing values to empty strings", () => {
    const summary = toSummary(null);
    assert.deepEqual(summary, {
      purpose: "",
      when_to_use: "",
      when_not_to_use: "",
    });
  });

  it("toSummary reads summary values from spec", () => {
    const spec = {
      summary: {
        purpose: "Purpose",
        when_to_use: "When",
        when_not_to_use: "When not",
      },
    } as PartialComponentSpec;

    const summary = toSummary(spec);
    assert.deepEqual(summary, {
      purpose: "Purpose",
      when_to_use: "When",
      when_not_to_use: "When not",
    });
  });

  it("isSummaryDirty reports changes accurately", () => {
    const baseline: SummaryFields = {
      purpose: "A",
      when_to_use: "B",
      when_not_to_use: "C",
    };
    assert.equal(isSummaryDirty({ ...baseline }, baseline), false);
    assert.equal(
      isSummaryDirty(
        {
          ...baseline,
          when_not_to_use: "Changed",
        },
        baseline,
      ),
      true,
    );
  });

  it("resolveCancelIntent returns confirm only when dirty", () => {
    assert.equal(resolveCancelIntent(false), "close");
    assert.equal(resolveCancelIntent(true), "confirm");
  });

  it("persistSummaryEditorial sends summary payload and returns normalized response", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const saved = await persistSummaryEditorial(
      {
        slug: "button",
        expectedHash: "abc",
        summary: {
          purpose: "P",
          when_to_use: "W",
          when_not_to_use: "N",
        },
      },
      {
        patchEditorialSpecFn: async (args) => {
          calls.push(args as unknown as Record<string, unknown>);
          return {
            ok: true,
            slug: "button",
            path: "docs/_spec/components/button.yml",
            rawHash: "new-hash",
            backupPath: "docs/_generated/spec-backups/button.last.yml",
            savedKeys: ["summary"],
            message: "Saved",
          };
        },
      },
    );

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
      slug: "button",
      expectedHash: "abc",
      fields: {
        summary: {
          purpose: "P",
          when_to_use: "W",
          when_not_to_use: "N",
        },
      },
    });
    assert.deepEqual(saved, {
      message: "Saved",
      rawHash: "new-hash",
    });
  });

  it("persistSummaryEditorial throws on failed API response", async () => {
    await assert.rejects(
      () =>
        persistSummaryEditorial(
          {
            slug: "button",
            expectedHash: null,
            summary: {
              purpose: "P",
              when_to_use: "W",
              when_not_to_use: "N",
            },
          },
          {
            patchEditorialSpecFn: async () => ({
              ok: false,
              slug: "button",
              path: "docs/_spec/components/button.yml",
              rawHash: null,
              backupPath: null,
              savedKeys: [],
              message: "Conflict",
            }),
          },
        ),
      /Conflict/,
    );
  });
});
