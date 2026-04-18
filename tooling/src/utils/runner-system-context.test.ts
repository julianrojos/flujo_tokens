import assert from "node:assert";
import { describe, it } from "node:test";

import {
  resolveRunnerSystemContext,
  resolveRunnerSystemContextOrExit,
} from "./runner-system-context.js";

const MOCK_CONTEXT = {
  id: "sys-01",
  name: "System 01",
  docsDir: "/repo/design-systems/sys-01/docs",
  paths: {
    input: "/repo/design-systems/sys-01/input",
    output: "/repo/design-systems/sys-01/output",
    generated: "/repo/design-systems/sys-01/docs/_generated",
    specs: "/repo/design-systems/sys-01/docs/_spec/components",
    docs: "/repo/design-systems/sys-01/docs/components",
    databaseUrl: "/repo/apps/ds-dashboard/server/db/ds-dashboard.db",
    figmaAliasGraph: "/repo/design-systems/sys-01/docs/_generated/figma-alias-graph.json",
  },
} as const;

describe("runner-system-context", () => {
  it("throws for empty explicit --system value", () => {
    assert.throws(
      () =>
        resolveRunnerSystemContext({
          parsedArgs: { system: "" },
          resolveContext: () => MOCK_CONTEXT,
        }),
      /cannot be empty/,
    );
  });

  it("throws when --system is provided without value", () => {
    assert.throws(
      () =>
        resolveRunnerSystemContext({
          parsedArgs: { system: true },
          resolveContext: () => MOCK_CONTEXT,
        }),
      /requires an explicit value/,
    );
  });

  it("uses default system resolution when --system is omitted", () => {
    let received: { system?: string } | undefined;
    const result = resolveRunnerSystemContext({
      parsedArgs: {},
      resolveContext: (opts) => {
        received = opts;
        return MOCK_CONTEXT;
      },
    });
    assert.deepStrictEqual(received, { system: undefined });
    assert.equal(result.id, "sys-01");
  });

  it("trims explicit --system value before resolution", () => {
    let received: { system?: string } | undefined;
    resolveRunnerSystemContext({
      parsedArgs: { system: "  sys-02  " },
      resolveContext: (opts) => {
        received = opts;
        return { ...MOCK_CONTEXT, id: "sys-02", name: "System 02" };
      },
    });
    assert.deepStrictEqual(received, { system: "sys-02" });
  });

  it("throws for invalid explicit --system format", () => {
    assert.throws(
      () =>
        resolveRunnerSystemContext({
          parsedArgs: { system: "../sys-01" },
          resolveContext: () => MOCK_CONTEXT,
        }),
      /invalid format/,
    );
  });

  it("logs and exits on resolution errors", () => {
    let logged = "";
    let exitCode: number | null = null;
    assert.throws(
      () =>
        resolveRunnerSystemContextOrExit({
          parsedArgs: { system: "unknown" },
          resolveContext: () => {
            throw new Error("Unknown system");
          },
          logger: {
            error(message: string) {
              logged = message;
            },
          },
          exitFn(code) {
            exitCode = code;
            throw new Error("exit");
          },
        }),
      /exit/,
    );
    assert.equal(exitCode, 1);
    assert.match(logged, /Failed to resolve system context:/);
    assert.match(logged, /Unknown system/);
  });

  it("writes to fallback sink and exits when logger is absent", () => {
    let stderrLine = "";
    let exitCode: number | null = null;
    assert.throws(
      () =>
        resolveRunnerSystemContextOrExit({
          parsedArgs: { system: "unknown" },
          resolveContext: () => {
            throw new Error("boom");
          },
          writeError(message) {
            stderrLine = message;
          },
          exitFn(code) {
            exitCode = code;
            throw new Error("exit");
          },
        }),
      /exit/,
    );
    assert.equal(exitCode, 1);
    assert.match(stderrLine, /Failed to resolve system context:/);
    assert.match(stderrLine, /boom/);
  });
});
