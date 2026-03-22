import { buildSpecValidationFeedbackPrompt } from "./spec-agent-runner.mjs";

export function runSpecGenerationFlow({
  prompt,
  agent,
  componentName,
  nodeId,
  skipValidation,
  outputPath,
  registryPath,
  runSpecGenerationPromptFn,
  runSpecRepairPromptFn,
  validateGeneratedSpecFn,
  materializeGeneratedSpec,
}) {
  runSpecGenerationPromptFn({
    prompt,
    agent,
    componentName,
    nodeId,
  });
  let { normalizedSpec, prefilledCount } = materializeGeneratedSpec();

  let validationReport = null;
  if (!skipValidation) {
    let validation = validateGeneratedSpecFn(outputPath, registryPath);
    if (!validation.ok) {
      const feedbackPrompt = buildSpecValidationFeedbackPrompt({
        basePrompt: prompt,
        outputPath,
        validationErrors: validation.errors,
      });
      runSpecRepairPromptFn({
        prompt: feedbackPrompt,
        agent,
        componentName,
        nodeId,
      });
      ({ normalizedSpec, prefilledCount } = materializeGeneratedSpec());
      validation = validateGeneratedSpecFn(outputPath, registryPath);
      if (!validation.ok) {
        throw new Error(
          `Generated spec failed validation after automatic repair.\n${JSON.stringify(
            {
              file: outputPath,
              errors: validation.errors,
            },
            null,
            2,
          )}`,
        );
      }
    }
    validationReport = validation.report;
  }

  return {
    normalizedSpec,
    prefilledCount,
    validationReport,
  };
}
