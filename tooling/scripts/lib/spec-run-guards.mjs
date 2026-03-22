export function assertBypassPolicy({
  force,
  skipValidation,
  allowNonEvidenceUpdates,
}) {
  if (skipValidation && !force) {
    throw new Error(
      "Validation gate bypass requires explicit force.\n" +
        "Use `--skip-validation true --force true` only for exceptional cases.",
    );
  }

  if (allowNonEvidenceUpdates && !force) {
    throw new Error(
      "Evidence gate bypass requires explicit force.\n" +
        "Use `--allow-non-evidence-updates true --force true` only for exceptional cases.",
    );
  }
}

export function assertFigmaSourceProvided({ figmaUrl, nodeId, rawComponentName }) {
  if (!figmaUrl && !nodeId && !rawComponentName) {
    throw new Error(
      "Missing Figma source.\nUse one of:\n- --url <figma-url>\n- --component-set-node-id <node-id>\n- --component-name <name> (less deterministic)",
    );
  }
}

export function assertOutputPath(outputPath) {
  if (!outputPath) {
    throw new Error("Missing output target.\nProvide --output or --component-name.");
  }
}
