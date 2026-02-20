import { isPlainObject } from "../is-plain-object.mjs";
import { COMPONENT_REGISTRY_SCHEMA_VERSION, PIPELINE_STAGE_ORDER } from "./constants.mjs";
import {
  isValidHttpUrl,
  isValidNodeId,
  stableHash,
} from "./utils.mjs";

const SLUG_RE = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const STATUS_SPEC_RE = /^(?:missing|unknown|draft|ready)$/;
const STATUS_DOC_RE = /^(?:missing|unknown|draft|ready|needs-review)$/;
const HASH_RE = /^[a-f0-9]{64}$/i;

function expectedStage(component) {
  if (
    component.visual_proof.exists &&
    (component.visual_proof.screenshot_url || component.visual_proof.image_path)
  ) {
    return "visual-proof";
  }
  if (component.render.exists) return "render";
  if (component.doc.exists) return "markdown";
  if (component.spec.exists) return "spec";
  return "missing-spec";
}

function countByStage(components) {
  const counters = Object.fromEntries(PIPELINE_STAGE_ORDER.map((stage) => [stage, 0]));
  for (const component of components) {
    const stage = String(component.pipeline_stage || "missing-spec");
    if (stage in counters) counters[stage] += 1;
  }
  return counters;
}

function validatePathShape(pathValue, expectedSuffix) {
  const value = String(pathValue || "");
  if (!value.startsWith("docs/")) return false;
  return value.endsWith(expectedSuffix);
}

function isDocsRelativePath(value) {
  const normalized = String(value || "").trim();
  return Boolean(normalized) && normalized.startsWith("docs/");
}

function pushError(errors, code, message, jsonPath) {
  errors.push({ code, message, path: jsonPath });
}

export function validateComponentRegistry(registry) {
  const errors = [];

  if (!isPlainObject(registry)) {
    return {
      ok: false,
      errors: [
        {
          code: "REGISTRY_TYPE",
          message: "Component registry must be a top-level object.",
          path: "$",
        },
      ],
    };
  }

  if (registry.schema_version !== COMPONENT_REGISTRY_SCHEMA_VERSION) {
    pushError(
      errors,
      "REGISTRY_SCHEMA_VERSION",
      `schema_version must be ${COMPONENT_REGISTRY_SCHEMA_VERSION}.`,
      "$.schema_version",
    );
  }

  if (!Array.isArray(registry.components)) {
    pushError(errors, "REGISTRY_COMPONENTS_TYPE", "components must be an array.", "$.components");
  }

  const components = Array.isArray(registry.components) ? registry.components : [];
  const seenSlugs = new Set();

  for (let index = 0; index < components.length; index += 1) {
    const component = components[index];
    const prefix = `$.components[${index}]`;

    if (!isPlainObject(component)) {
      pushError(errors, "COMPONENT_TYPE", "component entry must be an object.", prefix);
      continue;
    }

    const slug = String(component.slug || "");
    if (!SLUG_RE.test(slug)) {
      pushError(errors, "COMPONENT_SLUG", "component slug must be snake_case.", `${prefix}.slug`);
    }
    if (seenSlugs.has(slug)) {
      pushError(errors, "COMPONENT_SLUG_DUPLICATE", `duplicate component slug: ${slug}`, `${prefix}.slug`);
    }
    seenSlugs.add(slug);

    if (!String(component.display_name || "").trim()) {
      pushError(errors, "COMPONENT_DISPLAY_NAME", "display_name is required.", `${prefix}.display_name`);
    }

    if (!isPlainObject(component.paths)) {
      pushError(errors, "COMPONENT_PATHS_TYPE", "paths must be an object.", `${prefix}.paths`);
    } else {
      const expectedByKey = {
        spec: `/${slug}.yml`,
        doc: `/${slug}.md`,
        render_payload: `/${slug}.render-payload.json`,
        visual_proof: `/${slug}.json`,
      };
      for (const [key, suffix] of Object.entries(expectedByKey)) {
        if (!validatePathShape(component.paths[key], suffix)) {
          pushError(
            errors,
            "COMPONENT_PATH_VALUE",
            `paths.${key} must be a docs-relative path ending with ${suffix}.`,
            `${prefix}.paths.${key}`,
          );
        }
      }
    }

    if (!isPlainObject(component.spec)) {
      pushError(errors, "COMPONENT_SPEC_TYPE", "spec must be an object.", `${prefix}.spec`);
    } else {
      if (typeof component.spec.exists !== "boolean") {
        pushError(errors, "COMPONENT_SPEC_EXISTS", "spec.exists must be boolean.", `${prefix}.spec.exists`);
      }
      if (!STATUS_SPEC_RE.test(String(component.spec.status || ""))) {
        pushError(errors, "COMPONENT_SPEC_STATUS", "spec.status is invalid.", `${prefix}.spec.status`);
      }
    }

    if (!isPlainObject(component.doc)) {
      pushError(errors, "COMPONENT_DOC_TYPE", "doc must be an object.", `${prefix}.doc`);
    } else {
      if (typeof component.doc.exists !== "boolean") {
        pushError(errors, "COMPONENT_DOC_EXISTS", "doc.exists must be boolean.", `${prefix}.doc.exists`);
      }
      if (!STATUS_DOC_RE.test(String(component.doc.status || ""))) {
        pushError(errors, "COMPONENT_DOC_STATUS", "doc.status is invalid.", `${prefix}.doc.status`);
      }
    }

    if (!isPlainObject(component.figma)) {
      pushError(errors, "COMPONENT_FIGMA_TYPE", "figma must be an object.", `${prefix}.figma`);
    } else {
      const fileUrl = component.figma.file_url;
      if (fileUrl !== null && fileUrl !== undefined && !isValidHttpUrl(fileUrl)) {
        pushError(
          errors,
          "COMPONENT_FIGMA_FILE_URL",
          "figma.file_url must be null or a valid http(s) URL.",
          `${prefix}.figma.file_url`,
        );
      }
      const nodeId = component.figma.component_set_node_id;
      if (nodeId !== null && nodeId !== undefined && !isValidNodeId(nodeId)) {
        pushError(
          errors,
          "COMPONENT_FIGMA_NODE_ID",
          "figma.component_set_node_id must be null or a valid node id.",
          `${prefix}.figma.component_set_node_id`,
        );
      }
    }

    if (!isPlainObject(component.render)) {
      pushError(errors, "COMPONENT_RENDER_TYPE", "render must be an object.", `${prefix}.render`);
    } else if (typeof component.render.exists !== "boolean") {
      pushError(errors, "COMPONENT_RENDER_EXISTS", "render.exists must be boolean.", `${prefix}.render.exists`);
    }

    if (!isPlainObject(component.visual_proof)) {
      pushError(errors, "COMPONENT_PROOF_TYPE", "visual_proof must be an object.", `${prefix}.visual_proof`);
    } else {
      if (typeof component.visual_proof.exists !== "boolean") {
        pushError(
          errors,
          "COMPONENT_PROOF_EXISTS",
          "visual_proof.exists must be boolean.",
          `${prefix}.visual_proof.exists`,
        );
      }
      const screenshotUrl = component.visual_proof.screenshot_url;
      if (
        screenshotUrl !== null &&
        screenshotUrl !== undefined &&
        !isValidHttpUrl(screenshotUrl)
      ) {
        pushError(
          errors,
          "COMPONENT_PROOF_URL",
          "visual_proof.screenshot_url must be null or a valid http(s) URL.",
          `${prefix}.visual_proof.screenshot_url`,
        );
      }
      const imagePath = component.visual_proof.image_path;
      if (
        imagePath !== null &&
        imagePath !== undefined &&
        !isDocsRelativePath(imagePath)
      ) {
        pushError(
          errors,
          "COMPONENT_PROOF_IMAGE_PATH",
          "visual_proof.image_path must be null or a docs-relative path.",
          `${prefix}.visual_proof.image_path`,
        );
      }
    }

    const stage = String(component.pipeline_stage || "");
    if (!PIPELINE_STAGE_ORDER.includes(stage)) {
      pushError(errors, "COMPONENT_STAGE", "pipeline_stage is invalid.", `${prefix}.pipeline_stage`);
    } else {
      const expected = expectedStage(component);
      if (stage !== expected) {
        pushError(
          errors,
          "COMPONENT_STAGE_MISMATCH",
          `pipeline_stage must be ${expected} for current artifacts.`,
          `${prefix}.pipeline_stage`,
        );
      }
    }

    if (typeof component.ready_for_publish !== "boolean") {
      pushError(
        errors,
        "COMPONENT_READY_TYPE",
        "ready_for_publish must be boolean.",
        `${prefix}.ready_for_publish`,
      );
    } else {
      const expectedReady =
        component.spec?.status === "ready" &&
        component.doc?.status === "ready" &&
        Boolean(
          component.visual_proof?.screenshot_url ||
            component.visual_proof?.image_path,
        );
      if (component.ready_for_publish !== expectedReady) {
        pushError(
          errors,
          "COMPONENT_READY_MISMATCH",
          `ready_for_publish must be ${String(expectedReady)} with current statuses/proof.`,
          `${prefix}.ready_for_publish`,
        );
      }
    }

    if (!HASH_RE.test(String(component.fingerprint_sha256 || ""))) {
      pushError(
        errors,
        "COMPONENT_FINGERPRINT_FORMAT",
        "fingerprint_sha256 must be a 64-char hex hash.",
        `${prefix}.fingerprint_sha256`,
      );
    } else {
      const { fingerprint_sha256: _fingerprint, ...entryWithoutFingerprint } = component;
      const expectedFingerprint = stableHash(entryWithoutFingerprint);
      if (String(component.fingerprint_sha256) !== expectedFingerprint) {
        pushError(
          errors,
          "COMPONENT_FINGERPRINT_MISMATCH",
          "fingerprint_sha256 does not match entry content.",
          `${prefix}.fingerprint_sha256`,
        );
      }
    }

    if (index > 0) {
      const previousSlug = String(components[index - 1]?.slug || "");
      if (slug.localeCompare(previousSlug, "en", { sensitivity: "base" }) < 0) {
        pushError(
          errors,
          "COMPONENT_SORT",
          "components array must be sorted by slug ascending.",
          `${prefix}.slug`,
        );
      }
    }
  }

  if (!isPlainObject(registry.summary)) {
    pushError(errors, "REGISTRY_SUMMARY_TYPE", "summary must be an object.", "$.summary");
  } else {
    const summary = registry.summary;
    const expectedSummary = {
      total_components: components.length,
      with_spec: components.filter((component) => component.spec?.exists).length,
      with_doc: components.filter((component) => component.doc?.exists).length,
      with_render_payload: components.filter((component) => component.render?.exists).length,
      with_visual_proof: components.filter(
        (component) =>
          component.visual_proof?.exists &&
          (component.visual_proof?.screenshot_url ||
            component.visual_proof?.image_path),
      ).length,
      ready_for_publish: components.filter((component) => component.ready_for_publish).length,
      by_pipeline_stage: countByStage(components),
    };

    for (const key of [
      "total_components",
      "with_spec",
      "with_doc",
      "with_render_payload",
      "with_visual_proof",
      "ready_for_publish",
    ]) {
      if (summary[key] !== expectedSummary[key]) {
        pushError(
          errors,
          "REGISTRY_SUMMARY_MISMATCH",
          `summary.${key} must be ${expectedSummary[key]}.`,
          `$.summary.${key}`,
        );
      }
    }

    if (!isPlainObject(summary.by_pipeline_stage)) {
      pushError(
        errors,
        "REGISTRY_STAGE_SUMMARY_TYPE",
        "summary.by_pipeline_stage must be an object.",
        "$.summary.by_pipeline_stage",
      );
    } else {
      for (const stage of PIPELINE_STAGE_ORDER) {
        if (summary.by_pipeline_stage[stage] !== expectedSummary.by_pipeline_stage[stage]) {
          pushError(
            errors,
            "REGISTRY_STAGE_SUMMARY_MISMATCH",
            `summary.by_pipeline_stage.${stage} must be ${expectedSummary.by_pipeline_stage[stage]}.`,
            `$.summary.by_pipeline_stage.${stage}`,
          );
        }
      }
    }
  }

  if (!HASH_RE.test(String(registry.fingerprint_sha256 || ""))) {
    pushError(
      errors,
      "REGISTRY_FINGERPRINT_FORMAT",
      "fingerprint_sha256 must be a 64-char hex hash.",
      "$.fingerprint_sha256",
    );
  } else {
    const { fingerprint_sha256: _fingerprint, ...registryCore } = registry;
    const expectedFingerprint = stableHash(registryCore);
    if (String(registry.fingerprint_sha256) !== expectedFingerprint) {
      pushError(
        errors,
        "REGISTRY_FINGERPRINT_MISMATCH",
        "fingerprint_sha256 does not match registry content.",
        "$.fingerprint_sha256",
      );
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}
