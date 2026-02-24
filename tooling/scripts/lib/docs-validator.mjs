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
import {
  parseMarkdownFrontmatter,
} from "./parse-frontmatter.mjs";
import {
  validateOptionalVersionBlock,
  validateComponentFrontmatter,
  validateOverviewFrontmatter,
  validateWorkflowOrFoundationFrontmatter,
} from "./validators/frontmatter.mjs";
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
import {
  validateMarkdownTraceabilityNodeId,
  validateGeneratedTraceability,
  validateGapsSectionContract,
  validateVisualProofSection,
  validateReadyLifecycleConsistency,
} from "./validators/figma.mjs";
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

const _defaultCtx = resolveSystemContextSafe();
const SPEC_COMPONENTS_DIR = _defaultCtx.paths.specs;
const RULE_MANIFEST_PATH = path.join(PROJECT_ROOT, ".agent", "rules", "_manifest.yml");

export function validateDocs(options = {}) {
  const docsRoot = path.resolve(options.docsRoot || _defaultCtx.paths.docs);
  const specRoot = path.resolve(options.specRoot || SPEC_COMPONENTS_DIR);
  const explicitSpecFilePath = options.specFilePath
    ? path.resolve(options.specFilePath)
    : null;
  const registryPath = path.resolve(
    options.registryPath || DEFAULT_TOKEN_REGISTRY_PATH,
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
    let frontmatter = {};
    let content = raw;
    try {
      ({ frontmatter, content } = parseMarkdownFrontmatter(raw));
    } catch (error) {
      report.errors.push({
        code: "FM01",
        file: filePath,
        message: `Invalid markdown frontmatter: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
    const contentOffset = raw.length - content.length;
    const isOverview = path.basename(filePath) === "overview.md";

    report.summary.filesChecked += 1;
    if (isOverview) {
      validateOverviewFrontmatter(filePath, frontmatter, report);
      validateEditorialPlaceholders(
        filePath,
        content,
        report,
        lineStarts,
        lineFromOffset,
        contentOffset,
      );
      validateInternalLinks(filePath, raw, report, lineStarts, lineFromOffset);
      continue;
    }

    const docType = String(frontmatter.doc_type || "")
      .trim()
      .toLowerCase();
    const treatAsComponent = docType === "component" || !docType;

    if (treatAsComponent) {
      componentFiles.push(filePath);
      validateComponentDocFileName(filePath, report);
      validateComponentFrontmatter(filePath, frontmatter, report);
      validateMarkdownTraceabilityNodeId(
        filePath,
        frontmatter,
        specRoot,
        report,
        specResolution,
      );
      validateGeneratedTraceability(
        filePath,
        frontmatter,
        specRoot,
        registryPath,
        report,
        specResolution,
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
      validateReadyLifecycleConsistency(
        filePath,
        raw,
        frontmatter,
        specRoot,
        report,
        lineStarts,
        lineFromOffset,
        specResolution,
      );
      validateVisualProofSection(
        filePath,
        raw,
        frontmatter,
        report,
        lineStarts,
        lineFromOffset,
      );
      validateSectionOrder(
        filePath,
        content,
        report,
        lineStarts,
        lineFromOffset,
        contentOffset,
        {
          allowExtraH2,
        },
      );
    } else {
      validateWorkflowOrFoundationFrontmatter(filePath, frontmatter, report);
    }

    validateEditorialPlaceholders(
      filePath,
      content,
      report,
      lineStarts,
      lineFromOffset,
      contentOffset,
    );
    validateInternalLinks(filePath, raw, report, lineStarts, lineFromOffset);
    validateVariableIds(filePath, raw, report, lineStarts, lineFromOffset);
    validateTokenReferences(
      filePath,
      content,
      registryIndexes,
      report,
      lineStarts,
      lineFromOffset,
      contentOffset,
    );
    validateTokenFallbacks(
      filePath,
      content,
      registryIndexes,
      report,
      lineStarts,
      lineFromOffset,
      contentOffset,
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
      specComponentsDir: SPEC_COMPONENTS_DIR,
      validateOptionalVersionBlock,
    });
  }

  if (checkOverview) {
    validateOverviewLinks({
      docsRoot,
      componentFiles,
      report,
      parseMarkdownFrontmatter,
      buildLineStarts,
      lineFromOffset,
      normalizeHeadingText,
    });
    for (const overviewPath of overviewFiles) {
      if (!fs.existsSync(overviewPath)) continue;
      const raw = fs.readFileSync(overviewPath, "utf8");
      const lineStarts = buildLineStarts(raw);
      validateVariableIds(overviewPath, raw, report, lineStarts, lineFromOffset);
    }
  }

  annotateFindingsWithManifest(report.errors, manifestInfo.checks);
  annotateFindingsWithManifest(report.warnings, manifestInfo.checks);

  report.summary.errors = report.errors.length;
  report.summary.warnings = report.warnings.length;
  report.ok = report.summary.errors === 0;
  return report;
}
