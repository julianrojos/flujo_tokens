import fs from "node:fs";
import path from "node:path";

import {
  resolveSystemContextSafe,
  PROJECT_ROOT,
} from "./system-context.mjs";
import {
  loadTokenRegistry,
  DEFAULT_TOKEN_REGISTRY_PATH,
} from "./token-registry.mjs";
import { validateOptionalVersionBlock } from "./validators/version-block.mjs";
import {
  validateOverviewLinks,
  validateSpecMarkdownPairing,
} from "./validators/linking.mjs";
import { validateSpecYamlFiles } from "./validators/yaml.mjs";
import {
  createBaseReport,
  loadRuleManifest,
  annotateFindingsWithManifest,
} from "./validators/governance.mjs";
import { validateGapsSectionContract } from "./validators/figma.mjs";
import {
  buildRegistryIndexes,
  resolveTokenCandidate,
  validateTokenReferences,
  validateTokenFallbacks,
} from "./validators/token-references.mjs";
import {
  normalizeHeadingText,
  validateSectionOrder,
  validateComponentDocFileName,
  validateVariableIds,
  validateEditorialPlaceholders,
  validateInternalLinks,
} from "./validators/markdown-quality.mjs";
import {
  buildLineStarts,
  lineFromOffset,
  collectMarkdownFiles,
  collectSpecFiles,
} from "./validators/runtime-utils.mjs";

export { CANONICAL_H2_ORDER, REQUIRED_CANONICAL_H2 } from "./docs-config.mjs";
export { OPTIONAL_CANONICAL_H2 } from "./docs-config.mjs";

const RULE_MANIFEST_PATH = path.join(PROJECT_ROOT, ".agents", "rules", "_manifest.yml");

function resolveDocsValidatorDefaults() {
  try {
    const ctx = resolveSystemContextSafe();
    return {
      docsRoot: ctx.paths.docs,
      specRoot: ctx.paths.specs,
      registryPath: ctx.paths.tokenRegistry,
    };
  } catch {
    return {
      docsRoot: path.join(PROJECT_ROOT, "docs", "components"),
      specRoot: path.join(PROJECT_ROOT, "docs", "_spec", "components"),
      registryPath: path.join(PROJECT_ROOT, "docs", "_generated", "token-registry.json"),
    };
  }
}

export function validateDocs(options = {}) {
  const defaults = resolveDocsValidatorDefaults();
  const docsRoot = path.resolve(options.docsRoot || defaults.docsRoot);
  const specRoot = path.resolve(options.specRoot || defaults.specRoot);
  const explicitSpecFilePath = options.specFilePath
    ? path.resolve(options.specFilePath)
    : null;
  const registryPath = path.resolve(
    options.registryPath || defaults.registryPath || DEFAULT_TOKEN_REGISTRY_PATH,
  );
  const explicitFilePath = options.filePath
    ? path.resolve(options.filePath)
    : null;
  const allowExtraH2 = options.allowExtraH2 === true;
  const checkPairing = options.checkPairing !== false;
  const checkOverview = explicitFilePath
    ? false
    : options.checkOverview !== false;
  const checkSpecs =
    options.checkSpecs !== false &&
    (!explicitFilePath || Boolean(explicitSpecFilePath));

  const report = createBaseReport({
    manifestPath: RULE_MANIFEST_PATH,
  });
  const manifestInfo = loadRuleManifest(
    options.manifestPath || RULE_MANIFEST_PATH,
  );
  report.governance.manifestPath = manifestInfo.path;
  report.governance.manifestLoaded = manifestInfo.loaded;
  if (manifestInfo.error) {
    report.errors.push({
      code: "GOV01",
      file: manifestInfo.path,
      message: `Failed to parse rule manifest: ${manifestInfo.error}`,
    });
  }

  let registry;
  try {
    registry = loadTokenRegistry(registryPath);
  } catch (error) {
    report.errors.push({
      code: "REG01",
      file: registryPath,
      message:
        `${error instanceof Error ? error.message : String(error)}. ` +
        "Run `npm run generate:registry` before validating docs.",
    });
    report.ok = false;
    report.summary.errors = report.errors.length;
    return report;
  }

  const registryIndexes = buildRegistryIndexes(registry);
  const markdownFiles = collectMarkdownFiles(docsRoot, explicitFilePath);
  const overviewFiles = markdownFiles.filter(
    (filePath) => path.basename(filePath) === "overview.md",
  );
  const componentFiles = [];

  const specResolution =
    explicitFilePath && explicitSpecFilePath
      ? { specFilePath: explicitSpecFilePath }
      : {};

  for (const filePath of markdownFiles) {
    if (!fs.existsSync(filePath)) {
      report.errors.push({
        code: "DOC01",
        file: filePath,
        message: "Markdown file not found.",
      });
      continue;
    }
    const raw = fs.readFileSync(filePath, "utf8");
    const lineStarts = buildLineStarts(raw);
    const isOverview = path.basename(filePath) === "overview.md";

    report.summary.filesChecked += 1;
    if (isOverview) {
      continue;
    }

    componentFiles.push(filePath);
    validateComponentDocFileName(filePath, report);
    validateSectionOrder(
      filePath,
      raw,
      report,
      lineStarts,
      lineFromOffset,
      0,
      {
        allowExtraH2,
      },
    );
    validateEditorialPlaceholders(
      filePath,
      raw,
      report,
      lineStarts,
      lineFromOffset,
      0,
    );
    validateInternalLinks(filePath, raw, report, lineStarts, lineFromOffset);
    validateVariableIds(filePath, raw, report, lineStarts, lineFromOffset);
    validateTokenReferences(
      filePath,
      raw,
      registryIndexes,
      report,
      lineStarts,
      lineFromOffset,
      0,
    );
    validateTokenFallbacks(
      filePath,
      raw,
      registryIndexes,
      report,
      lineStarts,
      lineFromOffset,
      0,
    );
    validateGapsSectionContract(
      filePath,
      raw,
      specRoot,
      registry,
      report,
      lineStarts,
      lineFromOffset,
      specResolution,
    );
  }

  if (checkPairing) {
    validateSpecMarkdownPairing({
      componentFiles,
      docsRoot,
      specRoot,
      checkSpecs,
      explicitSpecFilePath,
      explicitFilePath,
      report,
      collectSpecFiles,
    });
  }

  if (checkSpecs) {
    validateSpecYamlFiles({
      specRoot,
      report,
      registryIndexes,
      explicitSpecFilePath,
      collectSpecFiles,
      resolveTokenCandidate,
      specComponentsDir: defaults.specRoot,
      validateOptionalVersionBlock,
    });
  }

  if (checkOverview) {
    validateOverviewLinks({
      docsRoot,
      componentFiles,
      report,
      buildLineStarts,
      lineFromOffset,
      normalizeHeadingText,
    });
  }

  annotateFindingsWithManifest(report.errors, manifestInfo.checks);
  annotateFindingsWithManifest(report.warnings, manifestInfo.checks);

  report.summary.errors = report.errors.length;
  report.summary.warnings = report.warnings.length;
  report.ok = report.summary.errors === 0;
  return report;
}
