import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import * as fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  computeFingerprint,
  loadSyncState,
  saveSyncState,
  shouldSkipTask,
  updateTaskState,
} from "./cache-utils.js";

describe("cache-utils", () => {
  let testDir: string;
  let statePath: string;

  before(() => {
    testDir = fs.mkdtempSync(path.join(tmpdir(), "cache-utils-test-"));
    statePath = path.join(testDir, ".sync-state.json");
  });

  after(() => {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("computeFingerprint", () => {
    it("returns consistent fingerprint for same values", () => {
      const fp1 = computeFingerprint({ values: { a: 1, b: 2 } });
      const fp2 = computeFingerprint({ values: { a: 1, b: 2 } });
      assert.equal(fp1, fp2);
    });

    it("returns different fingerprint for different values", () => {
      const fp1 = computeFingerprint({ values: { a: 1 } });
      const fp2 = computeFingerprint({ values: { a: 2 } });
      assert.notEqual(fp1, fp2);
    });

    it("serializes objects with sorted keys", () => {
      const fp1 = computeFingerprint({ values: { b: 2, a: 1 } });
      const fp2 = computeFingerprint({ values: { a: 1, b: 2 } });
      assert.equal(fp1, fp2);
    });

    it("includes file content in fingerprint", () => {
      const filePath = path.join(testDir, "test.txt");
      fs.writeFileSync(filePath, "hello");
      
      const fp1 = computeFingerprint({ files: [filePath], values: {} });
      fs.writeFileSync(filePath, "world");
      const fp2 = computeFingerprint({ files: [filePath], values: {} });
      
      assert.notEqual(fp1, fp2);
    });

    it("handles missing files gracefully", () => {
      const fp1 = computeFingerprint({ files: ["/nonexistent/file.txt"], values: {} });
      const fp2 = computeFingerprint({ files: ["/nonexistent/file.txt"], values: {} });
      assert.equal(fp1, fp2);
    });
  });

  describe("loadSyncState / saveSyncState", () => {
    it("creates empty state for non-existent file", () => {
      const state = loadSyncState(path.join(testDir, "nonexistent.json"));
      assert.equal(state.version, 1);
      assert.deepStrictEqual(state.tasks, {});
    });

    it("saves and loads state correctly", () => {
      const state = {
        version: 1,
        tasks: {
          "task-1": {
            fingerprint: "abc123",
            outputs: ["/path/to/output"],
            metadata: { foo: "bar" },
            updatedAt: new Date().toISOString(),
          },
        },
      };
      
      saveSyncState(state, statePath);
      const loaded = loadSyncState(statePath);
      
      assert.equal(loaded.version, 1);
      assert.ok(loaded.tasks["task-1"]);
      assert.equal(loaded.tasks["task-1"].fingerprint, "abc123");
    });

    it("returns empty state for invalid JSON", () => {
      const invalidPath = path.join(testDir, "invalid.json");
      fs.writeFileSync(invalidPath, "not valid json");
      
      const state = loadSyncState(invalidPath);
      assert.equal(state.version, 1);
      assert.deepStrictEqual(state.tasks, {});
    });
  });

  describe("shouldSkipTask", () => {
    it("returns false for missing task id", () => {
      const result = shouldSkipTask({ taskId: undefined });
      assert.equal(result.skip, false);
      assert.equal(result.reason, "missing_task_id");
    });

    it("returns false when force is true", () => {
      const result = shouldSkipTask({ taskId: "test", force: true });
      assert.equal(result.skip, false);
      assert.equal(result.reason, "force");
    });

    it("returns false for no previous state", () => {
      const result = shouldSkipTask({
        taskId: "new-task",
        fingerprint: "abc123",
        statePath,
      });
      assert.equal(result.skip, false);
      assert.equal(result.reason, "no_previous_state");
    });

    it("returns false when fingerprint changed", () => {
      // First, create state with one fingerprint
      updateTaskState({
        taskId: "existing-task",
        fingerprint: "old-fp",
        outputs: [],
        statePath,
      });
      
      // Then check with different fingerprint
      const result = shouldSkipTask({
        taskId: "existing-task",
        fingerprint: "new-fp",
        statePath,
      });
      
      assert.equal(result.skip, false);
      assert.equal(result.reason, "fingerprint_changed");
    });

    it("returns true when fingerprint matches and outputs exist", () => {
      const outputPath = path.join(testDir, "output.txt");
      fs.writeFileSync(outputPath, "content");
      
      updateTaskState({
        taskId: "cached-task",
        fingerprint: "same-fp",
        outputs: [outputPath],
        statePath,
      });
      
      const result = shouldSkipTask({
        taskId: "cached-task",
        fingerprint: "same-fp",
        outputs: [outputPath],
        statePath,
      });
      
      assert.equal(result.skip, true);
      assert.equal(result.reason, "unchanged");
    });

    it("returns false when outputs are missing", () => {
      const missingPath = path.join(testDir, "missing.txt");
      
      updateTaskState({
        taskId: "incomplete-task",
        fingerprint: "fp",
        outputs: [missingPath],
        statePath,
      });
      
      const result = shouldSkipTask({
        taskId: "incomplete-task",
        fingerprint: "fp",
        outputs: [missingPath],
        statePath,
      });
      
      assert.equal(result.skip, false);
      assert.equal(result.reason, "missing_outputs");
      assert.equal(result.missingOutputs.length, 1);
    });
  });

  describe("updateTaskState", () => {
    it("updates task state in file", () => {
      updateTaskState({
        taskId: "update-test",
        fingerprint: "test-fp",
        outputs: ["/test/output"],
        metadata: { updated: true },
        statePath,
      });
      
      const state = loadSyncState(statePath);
      assert.ok(state.tasks["update-test"]);
      assert.equal(state.tasks["update-test"].fingerprint, "test-fp");
      assert.equal(state.tasks["update-test"].metadata.updated, true);
    });

    it("does nothing for missing task id", () => {
      updateTaskState({
        taskId: undefined,
        fingerprint: "fp",
        statePath,
      });
      
      const state = loadSyncState(statePath);
      assert.equal(state.tasks["undefined"], undefined);
    });
  });
});
