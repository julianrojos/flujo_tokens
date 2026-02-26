/**
 * Spec Generation Flow Service
 *
 * Orchestrates the multi-step flow of spec generation, validation, and repair.
 */

import { buildSpecValidationFeedbackPrompt } from '../utils/index.js';
import type { AgentType, AgentPromptResult } from '../utils/index.js';

export interface RunSpecGenerationFlowOptions {
    prompt: string;
    agent?: AgentType;
    componentName?: string;
    nodeId?: string;
    skipValidation: boolean;
    outputPath: string;
    registryPath: string;
    runSpecGenerationPromptFn: (opts: any) => AgentPromptResult;
    runSpecRepairPromptFn: (opts: any) => AgentPromptResult;
    validateGeneratedSpecFn: (out: string, reg: string) => any;
    materializeGeneratedSpec: () => { normalizedSpec: any; prefilledCount: number };
}

export interface SpecGenerationFlowResult {
    normalizedSpec: any;
    prefilledCount: number;
    validationReport: any;
}

/**
 * Runs the standard spec generation flow: Generate -> Validate -> Repair (if needed).
 */
export function runSpecGenerationFlow(options: RunSpecGenerationFlowOptions): SpecGenerationFlowResult {
    const {
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
    } = options;

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
