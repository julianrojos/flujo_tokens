import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

import { parseYamlDocument } from "./parse-frontmatter.mjs";
import { normalizeSpec } from "./spec-normalizer.mjs";
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

export function materializeSpec({
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
}) {
  const templateSpec = parseYamlDocument(
    fs.readFileSync(templatePath, "utf8"),
    `spec template (${templatePath})`,
  );
  
  const generatedSpecRaw = parseYamlDocument(
    fs.readFileSync(outputPath, "utf8"),
    `generated spec (${outputPath})`,
  );

  const registryEntries = extractUniqueRegistryEntries(registryIndex);
  const tokenCandidates = pickComponentTokenCandidates(
    registryEntries,
    generatedSpecRaw.name || componentName,
  );

  const { normalizedSpec, prefilledCount } = normalizeSpec({
    templateSpec,
    generatedSpecRaw,
    componentName,
    nodeId,
    fileKeyFromUrl,
    tokenCandidates,
    prefillTokenMappingFn: prefillTokenMapping
  });

  if (existingSpec && !allowNonEvidenceUpdates) {
    evidenceGate({
      before: existingSpec,
      after: normalizedSpec,
      allowedKnownToKnownPrefixes: evidenceBackedPrefixes,
      label: `${outputPath} spec`,
    });
  }


  return {
    normalizedSpec,
    prefilledCount,
  };
}
