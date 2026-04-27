import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  handleDeleteDesignSystemRoute,
} from "./system-route-handler-service.ts";

function createRouteContext(repoRoot: string) {
  const targetPath = path.join(repoRoot, "design-systems", "alpha", "old.txt");
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, "legacy");

  const calls: string[] = [];
  const designSystemRepository = {
    async getConfig() {
      return {
        defaultSystem: "alpha",
        systems: [
          {
            id: "alpha",
            name: "Alpha",
            figmaFileId: "figma-file-alpha",
          },
        ],
      };
    },
    async delete(systemId: string) {
      calls.push(`delete:${systemId}`);
      assert.equal(systemId, "alpha");
      assert.ok(fs.existsSync(targetPath), "filesystem must still exist before DB delete");
      return true;
    },
    async setDefaultSystemId(id: string | null) {
      calls.push(`set-default:${String(id)}`);
      assert.equal(id, null);
    },
  };

  const dependencyRepo = {
    async listConsumers(dsFileKey: string) {
      calls.push(`preflight:${dsFileKey}`);
      assert.equal(dsFileKey, "figma-file-alpha");
      return [];
    },
    async removeAllByDsFileKey(dsFileKey: string) {
      calls.push(`cleanup:${dsFileKey}`);
      assert.equal(dsFileKey, "figma-file-alpha");
      return {
        deletedConsumerIds: [],
        deletedConsumerCount: 0,
      };
    },
  };

  const pendingOpsRepo = {
    async start(input: { type: string; systemId: string; payload: Record<string, unknown> }) {
      calls.push(`pending-start:${input.type}:${input.systemId}`);
      assert.equal(input.type, "delete_design_system");
      assert.equal(input.systemId, "alpha");
      assert.equal(input.payload.systemId, "alpha");
      assert.equal(input.payload.routeSystemId, "alpha");
      assert.equal(input.payload.figmaFileId, "figma-file-alpha");
      assert.equal(input.payload.normalizedFigmaFileId, "figma-file-alpha");
      assert.equal(input.payload.preflightConsumerCount, 0);
      return "pending-1";
    },
    async complete(id: string) {
      calls.push(`pending-complete:${id}`);
      assert.equal(id, "pending-1");
      assert.ok(!fs.existsSync(targetPath), "filesystem must be deleted before pending completion");
    },
    async abandon(id: string) {
      calls.push(`pending-abandon:${id}`);
    },
  };

  const c = {
    req: {
      param(name: string) {
        assert.equal(name, "id");
        return "alpha";
      },
    },
    json(payload: unknown, status = 200) {
      return { payload, status };
    },
  };

  const deps = {
    failJson: (ctx: typeof c, status: number, payload: unknown) => ctx.json(payload, status),
    designSystemRepository,
    repoRoot,
    resolveSafeSystemPathsForDeletion: () => [targetPath],
    fsSync: fs,
    summarizeDesignSystemsConfig: (config: unknown) => config as Record<string, unknown>,
    dependencyRepo,
    pendingOpsRepo,
  };

  return { c, deps, calls, targetPath };
}

test("handleDeleteDesignSystemRoute records a pending delete op even when there are no consumers", async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ds-delete-success-"));
  try {
    const { c, deps, calls, targetPath } = createRouteContext(repoRoot);

    const result = await handleDeleteDesignSystemRoute(c as never, deps as never);

    assert.equal(result.status, 200);
    assert.equal(fs.existsSync(targetPath), false);
    assert.deepEqual(calls, [
      "preflight:figma-file-alpha",
      "pending-start:delete_design_system:alpha",
      "cleanup:figma-file-alpha",
      "delete:alpha",
      "set-default:null",
      "pending-complete:pending-1",
    ]);

    const payload = result.payload as Record<string, unknown>;
    assert.equal(payload.ok, true);
    assert.equal(payload.deletedConsumersCount, 0);
    assert.deepEqual(payload.deletedConsumerNames, []);
    assert.equal(payload.consumerCleanupSkipped, false);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("handleDeleteDesignSystemRoute fails fast when preflight DB check fails", async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ds-delete-preflight-fail-"));
  try {
    const targetPath = path.join(repoRoot, "design-systems", "alpha", "old.txt");
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, "legacy");

    const calls: string[] = [];
    const c = {
      req: {
        param(name: string) {
          assert.equal(name, "id");
          return "alpha";
        },
      },
      json(payload: unknown, status = 200) {
        return { payload, status };
      },
    };

    const deps = {
      failJson: (ctx: typeof c, status: number, payload: unknown) => ctx.json(payload, status),
      designSystemRepository: {
        async getConfig() {
          return {
            defaultSystem: "alpha",
            systems: [
              {
                id: "alpha",
                name: "Alpha",
                figmaFileId: "figma-file-alpha",
              },
            ],
          };
        },
        async delete() {
          calls.push("delete");
          throw new Error("should not reach delete after preflight failure");
        },
        async setDefaultSystemId() {
          calls.push("set-default");
        },
      },
      repoRoot,
      resolveSafeSystemPathsForDeletion: () => [targetPath],
      fsSync: fs,
      summarizeDesignSystemsConfig: (config: unknown) => config as Record<string, unknown>,
      dependencyRepo: {
        async listConsumers() {
          calls.push("preflight");
          throw new Error("preflight failed");
        },
        async removeAllByDsFileKey() {
          calls.push("cleanup");
          return {
            deletedConsumerIds: [],
            deletedConsumerCount: 0,
          };
        },
      },
      pendingOpsRepo: {
        async start() {
          calls.push("pending-start");
          return "pending-1";
        },
        async complete() {
          calls.push("pending-complete");
        },
        async abandon() {
          calls.push("pending-abandon");
        },
      },
    };

    const result = await handleDeleteDesignSystemRoute(c as never, deps as never);

    assert.equal(result.status, 500);
    assert.equal(fs.existsSync(targetPath), true);
    assert.deepEqual(calls, ["preflight"]);
    assert.equal((result.payload as Record<string, unknown>).code, "design_system.delete_failed");
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("handleDeleteDesignSystemRoute abandons pending op and stops when consumer cleanup fails", async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ds-delete-fail-"));
  try {
    const targetPath = path.join(repoRoot, "design-systems", "alpha", "old.txt");
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, "legacy");

    const calls: string[] = [];
    const c = {
      req: {
        param(name: string) {
          assert.equal(name, "id");
          return "alpha";
        },
      },
      json(payload: unknown, status = 200) {
        return { payload, status };
      },
    };

    const deps = {
      failJson: (ctx: typeof c, status: number, payload: unknown) => ctx.json(payload, status),
      designSystemRepository: {
        async getConfig() {
          return {
            defaultSystem: "alpha",
            systems: [
              {
                id: "alpha",
                name: "Alpha",
                figmaFileId: "figma-file-alpha",
              },
            ],
          };
        },
        async delete() {
          calls.push("delete");
          throw new Error("should not reach delete after cleanup failure");
        },
        async setDefaultSystemId() {
          calls.push("set-default");
        },
      },
      repoRoot,
      resolveSafeSystemPathsForDeletion: () => [targetPath],
      fsSync: fs,
      summarizeDesignSystemsConfig: (config: unknown) => config as Record<string, unknown>,
      dependencyRepo: {
        async listConsumers() {
          calls.push("preflight");
          return [
            {
              id: "consumer-1",
              ds_file_key: "figma-file-alpha",
              consumer_file_key: "consumer-file-1",
              consumer_name: "Button Consumer",
              created_at: new Date("2026-01-01T00:00:00.000Z"),
            },
          ];
        },
        async removeAllByDsFileKey() {
          calls.push("cleanup");
          throw new Error("cleanup failed");
        },
      },
      pendingOpsRepo: {
        async start() {
          calls.push("pending-start");
          return "pending-1";
        },
        async complete() {
          calls.push("pending-complete");
        },
        async abandon(id: string) {
          calls.push(`pending-abandon:${id}`);
        },
      },
    };

    const result = await handleDeleteDesignSystemRoute(c as never, deps as never);

    assert.equal(result.status, 500);
    assert.equal(fs.existsSync(targetPath), true);
    assert.deepEqual(calls, ["preflight", "pending-start", "cleanup", "pending-abandon:pending-1"]);
    assert.equal((result.payload as Record<string, unknown>).code, "design_system.delete_failed");
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("handleDeleteDesignSystemRoute keeps pending op open when design-system deletion fails after cleanup", async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ds-delete-db-fail-"));
  try {
    const targetPath = path.join(repoRoot, "design-systems", "alpha", "old.txt");
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, "legacy");

    const calls: string[] = [];
    const c = {
      req: {
        param(name: string) {
          assert.equal(name, "id");
          return "alpha";
        },
      },
      json(payload: unknown, status = 200) {
        return { payload, status };
      },
    };

    const deps = {
      failJson: (ctx: typeof c, status: number, payload: unknown) => ctx.json(payload, status),
      designSystemRepository: {
        async getConfig() {
          return {
            defaultSystem: "alpha",
            systems: [
              {
                id: "alpha",
                name: "Alpha",
                figmaFileId: "figma-file-alpha",
              },
            ],
          };
        },
        async delete() {
          calls.push("delete");
          throw new Error("delete failed");
        },
        async setDefaultSystemId() {
          calls.push("set-default");
        },
      },
      repoRoot,
      resolveSafeSystemPathsForDeletion: () => [targetPath],
      fsSync: fs,
      summarizeDesignSystemsConfig: (config: unknown) => config as Record<string, unknown>,
      dependencyRepo: {
        async listConsumers() {
          calls.push("preflight");
          return [];
        },
        async removeAllByDsFileKey() {
          calls.push("cleanup");
          return {
            deletedConsumerIds: [],
            deletedConsumerCount: 0,
          };
        },
      },
      pendingOpsRepo: {
        async start() {
          calls.push("pending-start");
          return "pending-2";
        },
        async complete() {
          calls.push("pending-complete");
        },
        async abandon() {
          calls.push("pending-abandon");
        },
      },
    };

    const result = await handleDeleteDesignSystemRoute(c as never, deps as never);

    assert.equal(result.status, 500);
    assert.equal(fs.existsSync(targetPath), true);
    assert.deepEqual(calls, ["preflight", "pending-start", "cleanup", "delete"]);
    assert.equal((result.payload as Record<string, unknown>).code, "design_system.delete_failed");
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("handleDeleteDesignSystemRoute returns success when default update fails after delete", async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ds-delete-default-fail-"));
  try {
    const targetPath = path.join(repoRoot, "design-systems", "alpha", "old.txt");
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, "legacy");

    const calls: string[] = [];
    const c = {
      req: {
        param(name: string) {
          assert.equal(name, "id");
          return "alpha";
        },
      },
      json(payload: unknown, status = 200) {
        return { payload, status };
      },
    };

    const deps = {
      failJson: (ctx: typeof c, status: number, payload: unknown) => ctx.json(payload, status),
      designSystemRepository: {
        async getConfig() {
          return {
            defaultSystem: "alpha",
            systems: [
              {
                id: "alpha",
                name: "Alpha",
                figmaFileId: "figma-file-alpha",
              },
            ],
          };
        },
        async delete(systemId: string) {
          calls.push(`delete:${systemId}`);
          assert.equal(systemId, "alpha");
          assert.ok(fs.existsSync(targetPath), "filesystem must still exist before DB delete");
          return true;
        },
        async setDefaultSystemId(id: string | null) {
          calls.push(`set-default:${String(id)}`);
          throw new Error("default update failed");
        },
      },
      repoRoot,
      resolveSafeSystemPathsForDeletion: () => [targetPath],
      fsSync: fs,
      summarizeDesignSystemsConfig: (config: unknown) => config as Record<string, unknown>,
      dependencyRepo: {
        async listConsumers() {
          calls.push("preflight");
          return [];
        },
        async removeAllByDsFileKey() {
          calls.push("cleanup");
          return {
            deletedConsumerIds: [],
            deletedConsumerCount: 0,
          };
        },
      },
      pendingOpsRepo: {
        async start() {
          calls.push("pending-start");
          return "pending-3";
        },
        async complete(id: string) {
          calls.push(`pending-complete:${id}`);
        },
        async abandon() {
          calls.push("pending-abandon");
        },
      },
    };

    const result = await handleDeleteDesignSystemRoute(c as never, deps as never);

    assert.equal(result.status, 200);
    assert.equal(fs.existsSync(targetPath), false);
    assert.deepEqual(calls, [
      "preflight",
      "pending-start",
      "cleanup",
      "delete:alpha",
      "set-default:null",
      "pending-complete:pending-3",
    ]);
    const payload = result.payload as Record<string, unknown>;
    assert.equal(payload.ok, true);
    assert.equal(payload.deletedConsumersCount, 0);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("handleDeleteDesignSystemRoute leaves pending op open when filesystem cleanup fails", async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ds-delete-fs-fail-"));
  try {
    const targetPath = path.join(repoRoot, "design-systems", "alpha", "old.txt");
    const calls: string[] = [];
    const c = {
      req: {
        param(name: string) {
          assert.equal(name, "id");
          return "alpha";
        },
      },
      json(payload: unknown, status = 200) {
        return { payload, status };
      },
    };

    const fsSync = {
      existsSync() {
        return true;
      },
      rmSync(target: string) {
        calls.push(`rm:${target}`);
        assert.equal(target, targetPath);
        throw new Error("filesystem cleanup failed");
      },
      statSync() {
        throw new Error("statSync should not be called after rm failure");
      },
      readdirSync() {
        throw new Error("readdirSync should not be called after rm failure");
      },
      rmdirSync() {
        throw new Error("rmdirSync should not be called after rm failure");
      },
      mkdirSync() {
        throw new Error("mkdirSync should not be called");
      },
    };

    const deps = {
      failJson: (ctx: typeof c, status: number, payload: unknown) => ctx.json(payload, status),
      designSystemRepository: {
        async getConfig() {
          return {
            defaultSystem: "alpha",
            systems: [
              {
                id: "alpha",
                name: "Alpha",
                figmaFileId: "figma-file-alpha",
              },
            ],
          };
        },
        async delete(systemId: string) {
          calls.push(`delete:${systemId}`);
          return true;
        },
        async setDefaultSystemId(id: string | null) {
          calls.push(`set-default:${String(id)}`);
        },
      },
      repoRoot,
      resolveSafeSystemPathsForDeletion: () => [targetPath],
      fsSync,
      summarizeDesignSystemsConfig: (config: unknown) => config as Record<string, unknown>,
      dependencyRepo: {
        async listConsumers() {
          calls.push("preflight");
          return [];
        },
        async removeAllByDsFileKey() {
          calls.push("cleanup");
          return {
            deletedConsumerIds: [],
            deletedConsumerCount: 0,
          };
        },
      },
      pendingOpsRepo: {
        async start() {
          calls.push("pending-start");
          return "pending-fs-1";
        },
        async complete() {
          calls.push("pending-complete");
        },
        async abandon() {
          calls.push("pending-abandon");
        },
      },
    };

    const result = await handleDeleteDesignSystemRoute(c as never, deps as never);

    assert.equal(result.status, 200);
    assert.deepEqual(calls, [
      "preflight",
      "pending-start",
      "cleanup",
      "delete:alpha",
      "set-default:null",
      `rm:${targetPath}`,
    ]);
    const payload = result.payload as Record<string, unknown>;
    assert.equal(payload.ok, true);
    assert.equal(payload.filesystemCleanupPending, true);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});
