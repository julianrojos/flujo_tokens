import { buildSpecDiff } from "./spec-diff";
import type { TokenRegistry } from "../types/token-registry";
import type { ComponentSpec } from "ds-types";
import type { SpecValidationIssue, SpecValidationResult } from "../types/spec-editor";

type ValidationContext = {
  tokenRegistry?: TokenRegistry | null;
  previousSpec?: ComponentSpec | null;
};

const COMPONENT_SET_NODE_ID_RE = /^\d+:\d+$/;
const SNAKE_CASE_RE = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const PROPERTY_TYPES = new Set(["enum", "text", "boolean", "instance_swap"]);

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasMinItems(value: unknown, min = 1): value is unknown[] {
  return Array.isArray(value) && value.length >= min;
}

function addIssue(
  target: SpecValidationIssue[],
  issue: SpecValidationIssue,
) {
  target.push(issue);
}

function toValidationSummary(issues: SpecValidationIssue[]): SpecValidationResult {
  const blockingIssueCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.length - blockingIssueCount;
  return {
    valid: blockingIssueCount === 0,
    blockingIssueCount,
    warningCount,
    issues,
  };
}

function resolveTokenReference(
  tokenRegistry: TokenRegistry | null | undefined,
  tokenRef: string,
) {
  if (!tokenRegistry) return null;
  const query = String(tokenRef || "").trim();
  if (!query) return null;
  return (
    tokenRegistry.byPath?.[query] ??
    tokenRegistry.bySlashPath?.[query] ??
    null
  );
}

function collectTokenRefChecks(spec: ComponentSpec): Array<{ path: string; value: string }> {
  const refs: Array<{ path: string; value: string }> = [];
  const pushRef = (path: string, value: unknown) => {
    const tokenRef = String(value ?? "").trim();
    if (!tokenRef || tokenRef.toUpperCase() === "TBD") return;
    refs.push({ path, value: tokenRef });
  };

  if (isObjectRecord(spec.token_mapping)) {
    for (const [mappingKey, mappingValue] of Object.entries(spec.token_mapping)) {
      if (typeof mappingValue === "string") {
        pushRef(`token_mapping.${mappingKey}`, mappingValue);
        continue;
      }
      if (!isObjectRecord(mappingValue)) continue;
      for (const [condition, tokenRef] of Object.entries(mappingValue)) {
        pushRef(`token_mapping.${mappingKey}.${condition}`, tokenRef);
      }
    }
  }

  pushRef("accessibility.focus.tokens.inner", spec.accessibility?.focus?.tokens?.inner);
  pushRef("accessibility.focus.tokens.outer", spec.accessibility?.focus?.tokens?.outer);
  pushRef("accessibility.hit_area.desktop_token", spec.accessibility?.hit_area?.desktop_token);
  pushRef("accessibility.hit_area.mobile_token", spec.accessibility?.hit_area?.mobile_token);

  return refs;
}

function validateGuardrails(
  issues: SpecValidationIssue[],
  previousSpec: ComponentSpec | null | undefined,
  nextSpec: ComponentSpec,
) {
  if (!previousSpec) return;

  const previousNodeId = String(previousSpec.figma?.component_set_node_id || "").trim();
  const nextNodeId = String(nextSpec.figma?.component_set_node_id || "").trim();
  if (previousNodeId && !nextNodeId) {
    addIssue(issues, {
      severity: "error",
      code: "GUARDRAIL_NODE_ID_REMOVED",
      path: "figma.component_set_node_id",
      message:
        "Cannot remove figma.component_set_node_id when it already existed. Keep it or provide a replacement node id.",
    });
  }

  if (previousSpec.name && previousSpec.name !== nextSpec.name) {
    addIssue(issues, {
      severity: "warning",
      code: "GUARDRAIL_RENAME_CONFIRM",
      path: "name",
      message:
        `Component name changed from '${previousSpec.name}' to '${nextSpec.name}'. Confirm this intentional rename before save.`,
      requiresConfirmation: true,
    });
  }

  if (previousSpec.status === "ready" && nextSpec.status === "draft") {
    addIssue(issues, {
      severity: "warning",
      code: "GUARDRAIL_STATUS_DOWNGRADE_CONFIRM",
      path: "status",
      message: "Status downgraded from ready to draft. Confirm this intentional downgrade before save.",
      requiresConfirmation: true,
    });
  }
}

function validateRequiredTopLevelFields(
  issues: SpecValidationIssue[],
  parsed: Record<string, unknown>,
) {
  const requiredTopLevel = [
    "name",
    "status",
    "figma",
    "summary",
    "properties",
    "content_guidelines",
    "best_practices",
    "accessibility",
    "token_mapping",
    "qa",
  ];

  for (const field of requiredTopLevel) {
    if (!(field in parsed)) {
      addIssue(issues, {
        severity: "error",
        code: "SPEC_REQUIRED_FIELD",
        path: field,
        message: `Missing required top-level field '${field}'.`,
      });
    }
  }
}

function validateNameAndStatus(
  issues: SpecValidationIssue[],
  spec: ComponentSpec,
) {
  if (!spec.name || !/^[A-Z][A-Za-z0-9]*$/.test(String(spec.name))) {
    addIssue(issues, {
      severity: "error",
      code: "SPEC_NAME_INVALID",
      path: "name",
      message: "name must be PascalCase (for example: Button, StatusBar).",
    });
  }

  if (spec.status !== "draft" && spec.status !== "ready") {
    addIssue(issues, {
      severity: "error",
      code: "SPEC_STATUS_INVALID",
      path: "status",
      message: "status must be 'draft' or 'ready'.",
    });
  }
}

function validateFigma(
  issues: SpecValidationIssue[],
  spec: ComponentSpec,
) {
  if (!isObjectRecord(spec.figma)) {
    addIssue(issues, {
      severity: "error",
      code: "SPEC_FIGMA_INVALID",
      path: "figma",
      message: "figma must be an object.",
    });
    return;
  }

  if (!String(spec.figma.file || "").trim()) {
    addIssue(issues, {
      severity: "error",
      code: "SPEC_FIGMA_FILE_REQUIRED",
      path: "figma.file",
      message: "figma.file is required.",
    });
  }
  if (!String(spec.figma.page || "").trim()) {
    addIssue(issues, {
      severity: "error",
      code: "SPEC_FIGMA_PAGE_REQUIRED",
      path: "figma.page",
      message: "figma.page is required.",
    });
  }
  if (!String(spec.figma.component_set || "").trim()) {
    addIssue(issues, {
      severity: "error",
      code: "SPEC_FIGMA_COMPONENT_SET_REQUIRED",
      path: "figma.component_set",
      message: "figma.component_set is required.",
    });
  }

  const nodeId = String(spec.figma.component_set_node_id || "").trim();
  if (nodeId && !COMPONENT_SET_NODE_ID_RE.test(nodeId)) {
    addIssue(issues, {
      severity: "error",
      code: "SPEC_FIGMA_NODE_ID_INVALID",
      path: "figma.component_set_node_id",
      message: "figma.component_set_node_id must match '<number>:<number>'.",
    });
  }
  if (spec.status === "ready" && !nodeId) {
    addIssue(issues, {
      severity: "error",
      code: "SPEC_FIGMA_NODE_ID_REQUIRED_READY",
      path: "figma.component_set_node_id",
      message: "figma.component_set_node_id is required when status is ready.",
    });
  }
}

function validateSummary(
  issues: SpecValidationIssue[],
  spec: ComponentSpec,
) {
  if (!isObjectRecord(spec.summary)) {
    addIssue(issues, {
      severity: "error",
      code: "SPEC_SUMMARY_INVALID",
      path: "summary",
      message: "summary must be an object.",
    });
    return;
  }

  for (const field of ["purpose", "when_to_use", "when_not_to_use"]) {
    if (!String((spec.summary as Record<string, unknown>)[field] || "").trim()) {
      addIssue(issues, {
        severity: "error",
        code: "SPEC_SUMMARY_FIELD_REQUIRED",
        path: `summary.${field}`,
        message: `${field} is required.`,
      });
    }
  }
}

function validateProperties(
  issues: SpecValidationIssue[],
  spec: ComponentSpec,
) {
  if (!Array.isArray(spec.properties)) {
    addIssue(issues, {
      severity: "error",
      code: "SPEC_PROPERTIES_INVALID",
      path: "properties",
      message: "properties must be an array.",
    });
    return;
  }

  const seenNames = new Set<string>();
  spec.properties.forEach((property, index) => {
    const pathPrefix = `properties[${index}]`;
    const propertyName = String(property?.name || "").trim();
    if (!propertyName) {
      addIssue(issues, {
        severity: "error",
        code: "SPEC_PROPERTY_NAME_REQUIRED",
        path: `${pathPrefix}.name`,
        message: "property name is required.",
      });
    } else if (seenNames.has(propertyName.toLowerCase())) {
      addIssue(issues, {
        severity: "error",
        code: "SPEC_PROPERTY_NAME_DUPLICATE",
        path: `${pathPrefix}.name`,
        message: `property '${propertyName}' is duplicated.`,
      });
    } else {
      seenNames.add(propertyName.toLowerCase());
    }

    const type = String(property?.type || "").trim().toLowerCase();
    if (!PROPERTY_TYPES.has(type)) {
      addIssue(issues, {
        severity: "error",
        code: "SPEC_PROPERTY_TYPE_INVALID",
        path: `${pathPrefix}.type`,
        message: "property type must be enum, text, boolean, or instance_swap.",
      });
    }

    if (type === "enum") {
      if (!hasMinItems(property?.values)) {
        addIssue(issues, {
          severity: "error",
          code: "SPEC_PROPERTY_VALUES_REQUIRED",
          path: `${pathPrefix}.values`,
          message: "enum properties must define a non-empty values array.",
        });
      }
    } else if (hasMinItems(property?.values)) {
      addIssue(issues, {
        severity: "warning",
        code: "SPEC_PROPERTY_VALUES_UNEXPECTED",
        path: `${pathPrefix}.values`,
        message: `values usually only apply to enum properties (found for '${type || "unknown"}').`,
      });
    }

    if (typeof property?.required !== "boolean") {
      addIssue(issues, {
        severity: "error",
        code: "SPEC_PROPERTY_REQUIRED_INVALID",
        path: `${pathPrefix}.required`,
        message: "required must be boolean.",
      });
    }
  });
}

function validateContentGuidelinesAndBestPractices(
  issues: SpecValidationIssue[],
  spec: ComponentSpec,
) {
  if (!hasMinItems(spec.content_guidelines?.rules)) {
    addIssue(issues, {
      severity: "error",
      code: "SPEC_CONTENT_GUIDELINES_REQUIRED",
      path: "content_guidelines.rules",
      message: "content_guidelines.rules must contain at least one item.",
    });
  }

  if (!hasMinItems(spec.best_practices?.do)) {
    addIssue(issues, {
      severity: "error",
      code: "SPEC_BEST_PRACTICES_DO_REQUIRED",
      path: "best_practices.do",
      message: "best_practices.do must contain at least one item.",
    });
  }
  if (!hasMinItems(spec.best_practices?.dont)) {
    addIssue(issues, {
      severity: "error",
      code: "SPEC_BEST_PRACTICES_DONT_REQUIRED",
      path: "best_practices.dont",
      message: "best_practices.dont must contain at least one item.",
    });
  }
}

function validateAccessibility(
  issues: SpecValidationIssue[],
  spec: ComponentSpec,
) {
  if (!isObjectRecord(spec.accessibility)) {
    addIssue(issues, {
      severity: "error",
      code: "SPEC_ACCESSIBILITY_REQUIRED",
      path: "accessibility",
      message: "accessibility must be an object.",
    });
    return;
  }

  if (!String(spec.accessibility.role || "").trim()) {
    addIssue(issues, {
      severity: "error",
      code: "SPEC_ACCESSIBILITY_ROLE_REQUIRED",
      path: "accessibility.role",
      message: "accessibility.role is required.",
    });
  }
  if (!hasMinItems(spec.accessibility.labeling?.rules)) {
    addIssue(issues, {
      severity: "error",
      code: "SPEC_ACCESSIBILITY_LABELING_REQUIRED",
      path: "accessibility.labeling.rules",
      message: "accessibility.labeling.rules must contain at least one item.",
    });
  }
}

function validateQa(
  issues: SpecValidationIssue[],
  spec: ComponentSpec,
) {
  if (!hasMinItems(spec.qa, 2)) {
    addIssue(issues, {
      severity: "error",
      code: "SPEC_QA_MIN_ITEMS",
      path: "qa",
      message: "qa must contain at least two checks.",
    });
  }
}

function validateRelatedComponents(
  issues: SpecValidationIssue[],
  spec: ComponentSpec,
) {
  if (spec.related_components && Array.isArray(spec.related_components)) {
    const seenRelated = new Set<string>();
    for (let index = 0; index < spec.related_components.length; index += 1) {
      const related = String(spec.related_components[index] || "").trim();
      const itemPath = `related_components[${index}]`;
      if (!SNAKE_CASE_RE.test(related)) {
        addIssue(issues, {
          severity: "error",
          code: "SPEC_RELATED_COMPONENT_INVALID",
          path: itemPath,
          message: "related component values must be snake_case slugs.",
        });
        continue;
      }
      if (seenRelated.has(related)) {
        addIssue(issues, {
          severity: "error",
          code: "SPEC_RELATED_COMPONENT_DUPLICATE",
          path: itemPath,
          message: `related component '${related}' is duplicated.`,
        });
        continue;
      }
      seenRelated.add(related);
    }
  }
}

function validateTokenReferences(
  issues: SpecValidationIssue[],
  spec: ComponentSpec,
  context: ValidationContext,
) {
  if (context.tokenRegistry) {
    for (const tokenRef of collectTokenRefChecks(spec)) {
      if (!resolveTokenReference(context.tokenRegistry, tokenRef.value)) {
        addIssue(issues, {
          severity: "error",
          code: "SPEC_TOKEN_REF_UNRESOLVED",
          path: tokenRef.path,
          message: `Token reference '${tokenRef.value}' was not found in token registry.`,
        });
      }
    }
  }
}

export function validateComponentSpec(
  parsed: unknown,
  context: ValidationContext = {},
): SpecValidationResult {
  const issues: SpecValidationIssue[] = [];

  if (!isObjectRecord(parsed)) {
    addIssue(issues, {
      severity: "error",
      code: "SPEC_NOT_OBJECT",
      path: "$",
      message: "Spec root must be a YAML object.",
    });
    return toValidationSummary(issues);
  }

  validateRequiredTopLevelFields(issues, parsed);
  const spec = parsed as unknown as ComponentSpec;
  validateNameAndStatus(issues, spec);
  validateFigma(issues, spec);
  validateSummary(issues, spec);
  validateProperties(issues, spec);
  validateContentGuidelinesAndBestPractices(issues, spec);
  validateAccessibility(issues, spec);
  validateQa(issues, spec);
  validateRelatedComponents(issues, spec);
  validateTokenReferences(issues, spec, context);

  validateGuardrails(issues, context.previousSpec, spec);
  return toValidationSummary(issues);
}
