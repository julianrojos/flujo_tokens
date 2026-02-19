import fs from "node:fs";
import path from "node:path";

import { componentNameToSnakeCase } from "./component-name.mjs";
import { DOCS_ROOT, PROJECT_ROOT } from "./paths.mjs";

export const GOLDEN_COMPONENT_DOC_SAMPLE_PATH = path.resolve(
  PROJECT_ROOT,
  "tooling",
  "scripts",
  "lib",
  "golden-samples",
  "component-doc.md",
);

export const GOLDEN_COMPONENT_SPEC_SAMPLE_PATH = path.resolve(
  PROJECT_ROOT,
  "tooling",
  "scripts",
  "lib",
  "golden-samples",
  "component-spec.yml",
);

function sanitizeComponentName(rawName) {
  const value =
    typeof rawName === "string"
      ? rawName.trim()
      : typeof rawName === "number" && Number.isFinite(rawName)
        ? String(rawName)
        : "";
  if (value) return value;
  return "Component";
}

function buildComponentMarkdownSkeleton(componentName) {
  const safeName = sanitizeComponentName(componentName);
  return `---
doc_type: component
doc_status: draft
figma:
  file_url: TBD
  page: TBD
  component: ${safeName}
  last_verified: TBD
---

# ${safeName}

A concise summary of what the component does.

## Overview

- Purpose: TBD
- Figma component set: TBD
- Variant properties: TBD

## Anatomy

1. **Container**: TBD
2. **Primary element**: TBD

## Component API

### Properties

| Name | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| TBD | TBD | TBD | TBD | TBD |

## Visual Specifications

### Container

- Background: \`TBD\` (TBD)
- Border: \`TBD\` (TBD)
- Radius: \`TBD\` (TBD)

### Typography

- Font family: \`TBD\` (TBD)
- Font size: \`TBD\` (TBD)
- Line height: \`TBD\` (TBD)

## Variants

| Variant | Token | Fallback | Notes |
| --- | --- | --- | --- |
| TBD | \`TBD\` | TBD | TBD |

## States

- Default: TBD
- Disabled: TBD

## Usage Guidelines

### When to use

- TBD

### When not to use

- TBD

## Content Guidelines

- Tone: TBD
- Max length: TBD

## Accessibility

- ARIA: TBD
- Keyboard: TBD
- Contrast: TBD

## Related Components

- [TBD](tbd.md): TBD
`;
}

export function writeComponentDocSkeleton({
  componentName,
  outputPath,
  destinationDir,
} = {}) {
  const safeName = sanitizeComponentName(componentName);
  const slugFromOutput = outputPath
    ? path.basename(String(outputPath), path.extname(String(outputPath)))
    : "";
  const slug =
    componentNameToSnakeCase(safeName) || slugFromOutput || "component";

  const baseDir = path.resolve(
    destinationDir ||
      path.join(DOCS_ROOT, "_generated", "agent_prompts", "skeletons"),
  );
  fs.mkdirSync(baseDir, { recursive: true });

  const skeletonPath = path.join(baseDir, `${slug}.component-doc.skeleton.md`);
  const skeleton = buildComponentMarkdownSkeleton(safeName);
  fs.writeFileSync(skeletonPath, skeleton, "utf8");
  return skeletonPath;
}
