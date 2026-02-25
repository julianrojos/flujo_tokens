import fs from "node:fs";
import yaml from "js-yaml";
import { runOrThrow } from "./exec.mjs";
import { captureFileSnapshot, restoreFileSnapshot } from "./file-snapshot.mjs";

export function formatYamlFile(outputPath) {
  runOrThrow("npx", ["prettier", "--write", outputPath]);
}

export function writeNormalizedSpec({ outputPath, normalizedSpec }) {
  fs.writeFileSync(
    outputPath,
    yaml.dump(normalizedSpec, {
      lineWidth: 120,
      noRefs: true,
      sortKeys: false,
    }),
    "utf8",
  );
  formatYamlFile(outputPath);
}

export function writeSpecWithSnapshotGuard({ outputPath, normalizedSpec, applyWriteFn }) {
  const snapshot = captureFileSnapshot(outputPath);
  
  try {
    if (applyWriteFn) {
      applyWriteFn({ outputPath, normalizedSpec });
    } else {
      writeNormalizedSpec({ outputPath, normalizedSpec });
    }
  } catch (error) {
    restoreFileSnapshot(outputPath, snapshot);
    throw error;
  }
}
