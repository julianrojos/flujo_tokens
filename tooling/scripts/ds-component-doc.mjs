#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseArgs } from "./lib/parse-args.mjs";
import { runAgentPrompt } from "./lib/agent-runner.mjs";
import { validateDocs } from "./lib/docs-validator.mjs";
import { DOCS_ROOT, DOCS_SPEC_DIR, PROJECT_ROOT } from "./lib/paths.mjs";
import {
  normalizeComponentName,
  componentNameFromFilePath,
  componentNameToSnakeCase,
} from "./lib/component-name.mjs";
import {
  computeFingerprint,
  shouldSkipTask,
  updateTaskState,
} from "./lib/cache-utils.mjs";

const __filename = fileURLToPath(import.meta.url);

function formatMarkdown(outputPath) {
  const result = spawnSync("npx", ["prettier", "--write", outputPath], {
    stdio: "inherit",
  });
  if (result.error) {
    throw new Error(`Failed to run Prettier: ${result.error.message}`);
  }
  if ((result.status ?? 1) !== 0) {
    throw new Error(`Prettier exited with code ${result.status}`);
  }
}

function validateSpecPreflight(specPath) {
  const report = validateDocs({
    docsRoot: path.join(PROJECT_ROOT, "__docs_validation_stub__"),
    specFilePath: specPath,
    checkOverview: false,
    checkSpecs: true,
  });

  if (report.ok) return;

  const specErrors = report.errors.filter(
    (error) => path.resolve(String(error.file || "")) === path.resolve(specPath)
  );

  const payload = {
    file: specPath,
    errors: specErrors.length > 0 ? specErrors : report.errors,
  };
  throw new Error(
    "Spec validation failed. Markdown generation was blocked.\n" +
      `Run: npm run validate:docs -- --spec-file "${specPath}" --no-overview true\n` +
      `${JSON.stringify(payload, null, 2)}`
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const rawComponentName = String(args["component-name"] || "").trim();
  const docsRootInput = path.resolve(args["docs-root"] || DOCS_ROOT);
  const componentDocsDir =
    path.basename(docsRootInput) === "components"
      ? docsRootInput
      : path.join(docsRootInput, "components");
  const specRoot = args["spec-root"] || path.join(DOCS_SPEC_DIR, "components");
  const force = String(args.force || "false") === "true";
  const skipValidation = String(args["skip-validation"] || "false") === "true";
  const syncStatePath = args["sync-state"] || undefined;
  const agent = args.agent || "auto";

  if (!rawComponentName && !args["spec-file"]) {
    console.error("Missing --component-name or --spec-file.");
    process.exit(1);
  }

  const normalizedFromArg = normalizeComponentName(rawComponentName);
  const componentName = normalizedFromArg.displayName;
  const componentSlugFromArg = normalizedFromArg.fileSlug;
  if (!args["spec-file"] && !componentSlugFromArg) {
    console.error(
      "Invalid --component-name for path inference. Provide a valid component name, or pass --spec-file/--output explicitly."
    );
    process.exit(1);
  }
  const specPath = path.resolve(
    args["spec-file"] || path.join(specRoot, `${componentSlugFromArg}.yml`)
  );
  const normalizedFromSpecPath = componentNameFromFilePath(specPath);
  const componentSlug = componentSlugFromArg || normalizedFromSpecPath.fileSlug;
  const effectiveComponentName = componentName || normalizedFromSpecPath.displayName;

  const outputPath = path.resolve(
    args.output || path.join(componentDocsDir, `${componentSlug}.md`)
  );
  const overviewPath = path.resolve(path.join(componentDocsDir, "overview.md"));
  const safeName = componentNameToSnakeCase(effectiveComponentName || componentSlug || "component");

  if (!fs.existsSync(specPath)) {
    const suggestedName = effectiveComponentName || componentSlug || "Component";
    console.error(
      "Missing required spec file.\n" +
        `Spec: ${specPath}\n` +
        `Run: npm run ds:spec-from-figma -- --component-name "${suggestedName}" --output "${specPath}"`
    );
    process.exit(1);
  }

  if (!skipValidation) {
    try {
      validateSpecPreflight(specPath);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const taskId = `ds-component-doc:${specPath}->${outputPath}`;
  const fingerprint = computeFingerprint({
    files: [specPath, __filename],
    values: {
      componentName: effectiveComponentName || path.basename(specPath, path.extname(specPath)),
      outputPath,
      docsRoot: docsRootInput,
    },
  });
  const sync = shouldSkipTask({
    taskId,
    fingerprint,
    outputs: [outputPath],
    force,
    statePath: syncStatePath,
  });

  if (sync.skip) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          skipped: true,
          reason: sync.reason,
          outputPath,
          specPath,
          hint: "Use --force true to regenerate markdown.",
        },
        null,
        2
      )}\n`
    );
    return;
  }

  const prompt = [
    "Context",
    "- Generate one component documentation markdown from a spec YAML.",
    effectiveComponentName ? `- Component name: ${effectiveComponentName}` : "",
    "",
    "Sources",
    `- Spec YAML (source of truth): ${specPath}`,
    `- Existing docs style reference: ${path.resolve(path.join(componentDocsDir, "alert.md"))}`,
    `- Output component markdown path (required): ${outputPath}`,
    `- Overview path to keep in sync: ${overviewPath}`,
    "",
    "Constraints",
    "- Do not invent properties, variants, states, accessibility, or token semantics.",
    "- If spec lacks information, keep explicit `TBD` values and include `## Gaps / TBD`.",
    "- Never use Figma internal variable IDs (VariableID) in user-facing prose/tables.",
    "- Keep language and tone consistent with existing component docs.",
    "- Update overview links if needed so the component is discoverable.",
    "",
    "Expected Output",
    "- Write/update the markdown file at the exact output path.",
    "- Return a short report with final path and unresolved TBD count.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    runAgentPrompt({
      prompt,
      agent,
      label: `component-doc-${safeName}`,
    });
    formatMarkdown(outputPath);

    if (!skipValidation) {
      const report = validateDocs({
        filePath: outputPath,
        checkOverview: false,
        checkSpecs: false,
      });
      if (!report.ok) {
        throw new Error(
          `Generated markdown failed validation.\n${JSON.stringify(
            {
              file: outputPath,
              errors: report.errors,
            },
            null,
            2
          )}`
        );
      }
    }

    updateTaskState({
      taskId,
      fingerprint,
      outputs: [outputPath],
      metadata: {
        command: "ds-component-doc",
        specPath,
        specHashAtGeneration: computeFingerprint({ files: [specPath] }),
        markdownHashAtGeneration: computeFingerprint({ files: [outputPath] }),
      },
      statePath: syncStatePath,
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
