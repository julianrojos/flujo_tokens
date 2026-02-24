import path from "node:path";

import { validateDocs } from "./docs-validator.mjs";
import { PROJECT_ROOT } from "./system-context.mjs";

export function validateGeneratedSpec(outputPath, registryPath) {
  const report = validateDocs({
    docsRoot: path.join(PROJECT_ROOT, "__docs_validation_stub__"),
    registryPath,
    checkOverview: false,
    checkSpecs: true,
    checkPairing: false,
    specFilePath: outputPath,
  });

  const relevantErrors = report.errors.filter(
    (error) => path.resolve(error.file || "") === path.resolve(outputPath),
  );
  return {
    ok: report.ok,
    report,
    errors: relevantErrors.length > 0 ? relevantErrors : report.errors,
  };
}
