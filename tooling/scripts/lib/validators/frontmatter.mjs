import { isPlainObject } from "../is-plain-object.mjs";
import { isTbdMarker } from "../tbd.mjs";
import {
  ALLOWED_DOC_STATUS,
  COMPONENT_REQUIRED_FIGMA_FRONTMATTER_FIELDS,
} from "../docs-config.mjs";

const HASH_RE = /^[a-f0-9]{64}$/i;
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function validateFrontmatter(filePath, frontmatter, report) {
  const status = String(frontmatter.doc_status || "").trim();
  if (!ALLOWED_DOC_STATUS.has(status)) {
    report.errors.push({
      code: "FM02",
      file: filePath,
      message:
        "Frontmatter `doc_status` must be one of: draft, ready, needs-review.",
    });
  }
}

export function validateOptionalVersionBlock({
  filePath,
  versionNode,
  allowedKeys,
  report,
  context,
}) {
  if (versionNode === undefined || versionNode === null || versionNode === "")
    return;

  if (!isPlainObject(versionNode)) {
    report.errors.push({
      code: "VER01",
      file: filePath,
      message: `${context} \`version\` must be an object when declared.`,
    });
    return;
  }

  for (const [key, rawValue] of Object.entries(versionNode)) {
    if (!allowedKeys.has(key)) {
      report.errors.push({
        code: "VER01",
        file: filePath,
        message: `${context} version key \`${key}\` is not allowed.`,
      });
      continue;
    }

    const value = String(rawValue ?? "").trim();
    if (!value || isTbdMarker(value) || !SEMVER_RE.test(value)) {
      report.errors.push({
        code: "VER01",
        file: filePath,
        message: `${context} version \`${key}\` must be a SemVer string (for example \`1.2.3\`).`,
      });
    }
  }
}

export function validateComponentFrontmatter(filePath, frontmatter, report) {
  if (frontmatter.doc_type !== "component") {
    report.errors.push({
      code: "FM01",
      file: filePath,
      message: "Frontmatter must include `doc_type: component`.",
    });
  }

  validateFrontmatter(filePath, frontmatter, report);

  const figma = frontmatter.figma;
  if (!figma || typeof figma !== "object" || Array.isArray(figma)) {
    report.errors.push({
      code: "FM01",
      file: filePath,
      message: "Frontmatter `figma` object is required.",
    });
    return;
  }

  for (const field of COMPONENT_REQUIRED_FIGMA_FRONTMATTER_FIELDS) {
    const value = String(figma[field] ?? "").trim();
    if (!value) {
      report.errors.push({
        code: "FM01",
        file: filePath,
        message: `Frontmatter figma.${field} is required.`,
      });
    }
  }

  const componentHash = String(figma.component_hash ?? "").trim();
  if (componentHash) {
    if (isTbdMarker(componentHash) || !HASH_RE.test(componentHash)) {
      report.errors.push({
        code: "FM01",
        file: filePath,
        message:
          "Frontmatter figma.component_hash must be a 64-char sha256 hex string when declared.",
      });
    }
  }

  const validateOptionalCountField = (fieldName) => {
    const raw = figma[fieldName];
    if (raw === undefined || raw === null || raw === "") return;
    const text = String(raw).trim();
    if (!text) return;
    if (isTbdMarker(text)) {
      report.errors.push({
        code: "FM01",
        file: filePath,
        message: `Frontmatter figma.${fieldName} must be a non-negative integer when declared.`,
      });
      return;
    }
    const value = Number(text);
    if (!Number.isInteger(value) || value < 0) {
      report.errors.push({
        code: "FM01",
        file: filePath,
        message: `Frontmatter figma.${fieldName} must be a non-negative integer when declared.`,
      });
    }
  };

  validateOptionalCountField("properties_count");
  validateOptionalCountField("variants_count");

  validateOptionalVersionBlock({
    filePath,
    versionNode: frontmatter.version,
    allowedKeys: new Set(["spec", "component", "docs"]),
    report,
    context: "Frontmatter",
  });
}

export function validateOverviewFrontmatter(filePath, frontmatter, report) {
  if (frontmatter.doc_type !== "overview") {
    report.errors.push({
      code: "FM01",
      file: filePath,
      message: "Overview frontmatter must include `doc_type: overview`.",
    });
  }

  validateFrontmatter(filePath, frontmatter, report);
}

export function validateWorkflowOrFoundationFrontmatter(filePath, frontmatter, report) {
  const docType = String(frontmatter.doc_type || "").trim().toLowerCase();
  const allowed = new Set(["workflow", "foundation"]);
  if (!allowed.has(docType)) {
    report.errors.push({
      code: "FM01",
      file: filePath,
      message:
        "Frontmatter `doc_type` must be `component`, `overview`, `foundation`, or `workflow`.",
    });
  }

  validateFrontmatter(filePath, frontmatter, report);
}
