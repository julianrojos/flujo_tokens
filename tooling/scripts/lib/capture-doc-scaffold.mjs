import fs from "node:fs";
import path from "node:path";

import { componentNameToDisplayName } from "./component-name.mjs";

export function writeTextAtomic(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, content, "utf8");
  fs.renameSync(tempPath, filePath);
}

export function buildOverviewSeed() {
  return `---
doc_type: overview
doc_status: draft
---

# Components Overview

## Component list

`;
}

export function ensureSystemDocsScaffold({ docsRootDir, componentDocsDir }) {
  const specsDir = path.join(docsRootDir, "_spec", "components");
  const generatedDir = path.join(docsRootDir, "_generated");
  const overviewPath = path.join(componentDocsDir, "overview.md");

  fs.mkdirSync(componentDocsDir, { recursive: true });
  fs.mkdirSync(specsDir, { recursive: true });
  fs.mkdirSync(generatedDir, { recursive: true });

  if (!fs.existsSync(overviewPath)) {
    writeTextAtomic(overviewPath, buildOverviewSeed());
  }

  return { specsDir, generatedDir, overviewPath };
}

export function buildMarkdownSeed({ slug, candidateName, nodeUrl, nodeId }) {
  const displayName = componentNameToDisplayName(candidateName || slug) || "Component";
  return `---
doc_type: component
doc_status: draft
figma:
  file_url: ${nodeUrl || "TBD"}
  page: TBD
  component: ${displayName}
  component_set_node_id: ${nodeId || "TBD"}
  last_verified: TBD
---

# ${displayName}

Auto-generated placeholder created during Figma capture workflow.

## Overview

- Purpose: TBD
- Figma component set: ${nodeId || "TBD"}
- Variant properties: TBD
- Artwork source instance: Required hidden instance used to drive Anatomy, Properties, and Layout and spacing sections.

### Visual Proof

- Screenshot: TBD
- Source node: ${nodeId || "TBD"}
- Artifact: TBD

## Anatomy

1. **Container**: TBD
2. **Primary element**: TBD
`;
}
