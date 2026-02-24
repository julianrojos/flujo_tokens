export function buildSpecGenerationResult({
  outputPath,
  normalizedSpec,
  componentName,
  nodeId,
  prefilledCount,
  unresolvedTbdCount,
  validationReport,
  indicesSync,
}) {
  return {
    ok: true,
    outputPath,
    componentName: normalizedSpec.name || componentName || null,
    componentSetNodeId: nodeId || null,
    tokenPrefilled: prefilledCount,
    unresolvedTbdCount,
    validation: validationReport
      ? {
          ok: validationReport.ok,
          errors: validationReport.summary.errors,
          warnings: validationReport.summary.warnings,
        }
      : { skipped: true },
    documentationIndices: {
      changed: indicesSync.changed,
      written: indicesSync.written,
      registryPath: indicesSync.registry.registryPath,
      registryFingerprint: indicesSync.registry.fingerprint,
      overviewPath: indicesSync.overview.overviewPath,
    },
  };
}
