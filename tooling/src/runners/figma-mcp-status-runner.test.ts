import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { runFigmaMcpStatus } from "./figma-mcp-status-runner.js";

class ExitSignal extends Error {
  code: number;

  constructor(code: number) {
    super(`process.exit(${code})`);
    this.code = code;
  }
}

async function runAndCapture(args: string[]): Promise<{ code: number; payload: Record<string, unknown> }> {
  const writes: string[] = [];
  const originalWrite = process.stdout.write;
  const originalExit = process.exit;

  (process.stdout.write as unknown as (chunk: unknown) => boolean) = (chunk: unknown) => {
    writes.push(String(chunk ?? ""));
    return true;
  };
  (process.exit as unknown as (code?: number) => never) = (code?: number) => {
    throw new ExitSignal(Number.isFinite(code) ? Number(code) : 0);
  };

  try {
    await runFigmaMcpStatus(args);
    throw new Error("Expected runner to call process.exit");
  } catch (error) {
    if (!(error instanceof ExitSignal)) {
      throw error;
    }
    const output = writes.join("").trim();
    const payload = JSON.parse(output) as Record<string, unknown>;
    return { code: error.code, payload };
  } finally {
    process.stdout.write = originalWrite;
    process.exit = originalExit;
  }
}

describe("figma-mcp-status-runner", () => {
  it("returns mcp.invalid_format when --format is unsupported", async () => {
    const result = await runAndCapture(["--format", "text"]);
    assert.equal(result.code, 1);
    assert.equal(result.payload.code, "mcp.invalid_format");
  });

  it("returns an error payload for invalid --timeout-ms", async () => {
    const result = await runAndCapture(["--timeout-ms", "abc"]);
    assert.equal(result.code, 1);
    assert.equal(result.payload.code, "mcp.error");
    assert.match(String(result.payload.message || ""), /Invalid --timeout-ms value/i);
  });

  it("returns an error payload for invalid --wait-for-connection-ms", async () => {
    const result = await runAndCapture(["--wait-for-connection-ms", "-1"]);
    assert.equal(result.code, 1);
    assert.equal(result.payload.code, "mcp.error");
    assert.match(String(result.payload.message || ""), /Invalid --wait-for-connection-ms value/i);
  });
});
