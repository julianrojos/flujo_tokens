import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

import { parseYamlDocument } from "./parse-frontmatter.mjs";
import { componentNameToDisplayName } from "./component-name.mjs";
import { isPlainObject } from "./is-plain-object.mjs";
import { isTbdMarker } from "./tbd.mjs";
import { mergeWithTemplate, normalizeSpecOrder } from "./spec-normalizer.mjs";
import {
  extractUniqueRegistryEntries,
  pickComponentTokenCandidates,
  prefillTokenMapping,
} from "./spec-token-mapping.mjs";

export function ensureSpecTemplateExists(templatePath) {
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Spec template not found: ${templatePath}`);
  }
}

export function ensureSpecOutputDirectory(outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
}

export function parseExistingSpecFromSnapshot(outputSnapshot, outputPath) {
  if (!outputSnapshot?.exists) return null;
  return parseYamlDocument(
    outputSnapshot.content,
    `existing spec (${outputPath})`,
  );
}

function ensureSpecMetadata(spec, { componentName, nodeId, fileKeyFromUrl }) {
  if (!isPlainObject(spec.figma)) spec.figma = {};
  if (componentName && isTbdMarker(spec.name))
    spec.name = componentNameToDisplayName(componentName);
  if (componentName && !String(spec.name || "").trim())
    spec.name = componentNameToDisplayName(componentName);

  if (fileKeyFromUrl && (!spec.figma.file || isTbdMarker(spec.figma.file))) {
    spec.figma.file = fileKeyFromUrl;
  }
  if (
    nodeId &&
    (!spec.figma.component_set_node_id ||
      isTbdMarker(spec.figma.component_set_node_id))
  ) {
    spec.figma.component_set_node_id = nodeId;
  }
  return spec;
}

export function materializeAndWriteSpec({
  outputPath,
  templatePath,
  registryIndex,
  componentName,
  nodeId,
  fileKeyFromUrl,
  existingSpec,
  allowNonEvidenceUpdates,
  evidenceGate,
  evidenceBackedPrefixes,
  formatYamlFile,
}) {
  if (!fs.existsSync(outputPath)) {
    throw new Error(`Expected generated spec file not found at ${outputPath}`);
  }

  const templateSpec = parseYamlDocument(
    fs.readFileSync(templatePath, "utf8"),
    `spec template (${templatePath})`,
  );
  const generatedSpecRaw = parseYamlDocument(
    fs.readFileSync(outputPath, "utf8"),
    `generated spec (${outputPath})`,
  );

  const mergedSpec = mergeWithTemplate(templateSpec, generatedSpecRaw);
  ensureSpecMetadata(mergedSpec, { componentName, nodeId, fileKeyFromUrl });

  const registryEntries = extractUniqueRegistryEntries(registryIndex);
  const tokenCandidates = pickComponentTokenCandidates(
    registryEntries,
    mergedSpec.name || componentName,
  );
  const prefilledCount = prefillTokenMapping(
    mergedSpec.token_mapping,
    tokenCandidates,
    "token_mapping",
  );

  const normalizedSpec = normalizeSpecOrder(mergedSpec);
  if (existingSpec && !allowNonEvidenceUpdates) {
    evidenceGate({
      before: existingSpec,
      after: normalizedSpec,
      allowedKnownToKnownPrefixes: evidenceBackedPrefixes,
      label: `${outputPath} spec`,
    });
  }

  fs.writeFileSync(
    outputPath,
    yaml.dump(normalizedSpec, {
      lineWidth: 120,
      noRefs: true,
      sortKeys: false,
    }),
    "utf8",
  );

  formatYamlFile(outputPath);

  return {
    normalizedSpec,
    prefilledCount,
  };
}
