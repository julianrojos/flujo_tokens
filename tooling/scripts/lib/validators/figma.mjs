import fs from "node:fs";
import path from "node:path";

import { parseYamlDocument } from "../parse-frontmatter.mjs";
import { isPlainObject } from "../is-plain-object.mjs";
import { normalizeNodeId } from "../node-id.mjs";
import {
  extractGapsFromSpec,
  buildGapsChecklistLines,
  extractGapsSection,
  extractNonEmptySectionLines,
} from "../gaps.mjs";
import {
  GAP_ERROR_CODES,
  GAP_CHECK_MESSAGES,
  GAPS_VALIDATION,
} from "../gaps-contract.mjs";

function readComponentSpecByDocPath(componentDocPath, specRoot, options = {}) {
  const explicitSpecFilePath = options.specFilePath
    ? path.resolve(String(options.specFilePath))
    : "";
  const fileBase = path.basename(componentDocPath, path.extname(componentDocPath));
  const specPath = explicitSpecFilePath || path.join(specRoot, `${fileBase}.yml`);
  if (!fs.existsSync(specPath)) {
    return {
      specPath,
      exists: false,
      status: "",
      componentSetNodeIdRaw: "",
      componentSetNodeId: "",
      parsed: null,
    };
  }

  try {
    const parsed = parseYamlDocument(
      fs.readFileSync(specPath, "utf8"),
      `spec YAML (${path.basename(specPath)})`,
    );
    const status = String(parsed.status || "").trim().toLowerCase();
    const figma = isPlainObject(parsed.figma) ? parsed.figma : {};
    const componentSetNodeIdRaw = String(figma.component_set_node_id || "").trim();
    return {
      specPath,
      exists: true,
      status,
      componentSetNodeIdRaw,
      componentSetNodeId: normalizeNodeId(componentSetNodeIdRaw),
      parsed,
      parseError: null,
    };
  } catch (error) {
    return {
      specPath,
      exists: true,
      status: "",
      componentSetNodeIdRaw: "",
      componentSetNodeId: "",
      parsed: null,
      parseError: error instanceof Error ? error.message : String(error),
    };
  }
}

export function validateGapsSectionContract(
  filePath,
  rawMarkdown,
  specRoot,
  registry,
  report,
  lineStarts,
  lineFromOffset,
  specResolution = {},
) {
  const spec = readComponentSpecByDocPath(filePath, specRoot, specResolution);
  const section = extractGapsSection(rawMarkdown);

  if (!spec.exists) {
    if (section) {
      report.warnings.push({
        code: GAP_ERROR_CODES.GAP00,
        file: filePath,
        line: section ? lineFromOffset(lineStarts, section.start) : undefined,
        message: GAP_CHECK_MESSAGES.GAP00,
      });
    }
    return;
  }

  if (spec.parseError || !spec.parsed) {
    report.errors.push({
      code: GAP_ERROR_CODES.GAP01,
      file: filePath,
      message: `${GAP_CHECK_MESSAGES.GAP01_spec_parse_error}: ${spec.parseError}`,
      suggested: path.relative(process.cwd(), spec.specPath),
    });
    return;
  }

  const gaps = extractGapsFromSpec({ spec: spec.parsed, registry });
  const expectedLines = buildGapsChecklistLines(gaps);
  const hasReadyStatusWithGaps = spec.status === "ready" && gaps.length > 0;
  const readyStatusWithGapsNote = hasReadyStatusWithGaps
    ? GAP_CHECK_MESSAGES.GAP02_note
    : "";

  if (hasReadyStatusWithGaps) {
    report.errors.push({
      code: GAP_ERROR_CODES.GAP02,
      file: spec.specPath,
      message: GAP_CHECK_MESSAGES.GAP02_ready_with_gaps,
    });
  }

  if (expectedLines.length === 0) {
    if (!section) return;
    report.errors.push({
      code: GAP_ERROR_CODES.GAP01,
      file: filePath,
      line: lineFromOffset(lineStarts, section.start),
      message: GAP_CHECK_MESSAGES.GAP01_section_not_needed,
    });
    return;
  }

  if (!section) {
    report.errors.push({
      code: GAP_ERROR_CODES.GAP01,
      file: filePath,
      message: `${GAP_CHECK_MESSAGES.GAP01_section_missing}${readyStatusWithGapsNote}`,
    });
    return;
  }

  const rawSectionLines = extractNonEmptySectionLines(section.body);
  if (rawSectionLines.length === 0) {
    report.errors.push({
      code: GAP_ERROR_CODES.GAP01,
      file: filePath,
      line: lineFromOffset(lineStarts, section.start),
      message: `${GAP_CHECK_MESSAGES.GAP01_section_empty}${readyStatusWithGapsNote}`,
    });
    return;
  }

  const invalidLine = rawSectionLines.find(
    (line) => !GAPS_VALIDATION.checkboxFormatRegex.test(line),
  );
  if (invalidLine) {
    report.errors.push({
      code: GAP_ERROR_CODES.GAP01,
      file: filePath,
      line: lineFromOffset(lineStarts, section.start),
      message: `${GAP_CHECK_MESSAGES.GAP01_invalid_item_format}${readyStatusWithGapsNote}`,
      details: invalidLine,
    });
    return;
  }

  const actualLines = rawSectionLines;
  const sameLength = actualLines.length === expectedLines.length;
  const sameOrder =
    sameLength &&
    actualLines.every((line, index) => line === expectedLines[index]);
  if (sameOrder) return;

  report.errors.push({
    code: GAP_ERROR_CODES.GAP01,
    file: filePath,
    line: lineFromOffset(lineStarts, section.start),
    message: `${GAP_CHECK_MESSAGES.GAP01_content_mismatch}${readyStatusWithGapsNote}`,
    expected: expectedLines,
    actual: actualLines,
  });
}
