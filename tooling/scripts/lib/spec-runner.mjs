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
  parseExistingSpecFromSnapshotFn = parseExistingSpecFromSnapshot,
  captureScopedWriteSnapshotFn = captureScopedWriteSnapshot,
  assertScopedWritePolicyFn = assertScopedWritePolicy,
}) {
  // We capture the file state here strictly to parse the existing spec for evidence gates.
  // Note: Rollbacks for 'outputPath' are handled independently by 'writeSpecWithSnapshotGuard'
  // inside the orchestrator right when the write happens, so we do not restore it in this catch block.
  const existingFileState = captureFileSnapshotFn(outputPath);
  const existingSpec = parseExistingSpecFromSnapshotFn(existingFileState, outputPath);
  
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
