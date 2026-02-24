import { captureFileSnapshot, restoreFileSnapshot } from "./file-snapshot.mjs";
import { captureScopedWriteSnapshot, assertScopedWritePolicy } from "./scoped-write-guard.mjs";
import { parseExistingSpecFromSnapshot } from "./spec-write-adapter.mjs";

export function runSpecWithGuards({
  outputPath,
  resolvedSpecRoot,
  docsPath,
  registryIndexPath,
  allowedWritePaths,
  run,
  label = "ds-spec-from-figma",
  captureFileSnapshotFn = captureFileSnapshot,
  restoreFileSnapshotFn = restoreFileSnapshot,
  parseExistingSpecFromSnapshotFn = parseExistingSpecFromSnapshot,
  captureScopedWriteSnapshotFn = captureScopedWriteSnapshot,
  assertScopedWritePolicyFn = assertScopedWritePolicy,
}) {
  const outputSnapshot = captureFileSnapshotFn(outputPath);
  const existingSpec = parseExistingSpecFromSnapshotFn(outputSnapshot, outputPath);
  const scopeSnapshot = captureScopedWriteSnapshotFn({
    directories: [resolvedSpecRoot, docsPath],
    files: [registryIndexPath],
    extensions: [".yml", ".md", ".json"],
  });

  try {
    const result = run({ existingSpec });
    assertScopedWritePolicyFn({
      snapshot: scopeSnapshot,
      allowedPaths: allowedWritePaths,
      label,
    });
    return result;
  } catch (error) {
    restoreFileSnapshotFn(outputPath, outputSnapshot);
    let scopeMessage = "";
    try {
      assertScopedWritePolicyFn({
        snapshot: scopeSnapshot,
        allowedPaths: allowedWritePaths,
        label,
      });
    } catch (scopeError) {
      scopeMessage = `\n${scopeError instanceof Error ? scopeError.message : String(scopeError)}`;
    }
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}${scopeMessage}`,
    );
  }
}
