#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const mdDir = path.resolve(process.cwd(), "docs/components");

async function main() {
  const files = await fs.readdir(mdDir);
  const mdFiles = files.filter(f => f.endsWith(".md") && !f.startsWith("_"));

  let migrated = 0;
  for (const file of mdFiles) {
    const fullPath = path.join(mdDir, file);
    let original = await fs.readFile(fullPath, "utf-8");
    let content = original;

    // Anatomy
    if (!content.includes("AUTO-GENERATED-ANATOMY:START") && content.includes("## Anatomy")) {
      content = content.replace(/(##\s+Anatomy\s*\n)([\s\S]*?)(?=\n## |\n*$)/, "$1<!-- AUTO-GENERATED-ANATOMY:START -->\n$2\n<!-- AUTO-GENERATED-ANATOMY:END -->");
    }

    // Properties (Usually ### Properties inside ## Component API or similar)
    if (!content.includes("AUTO-GENERATED-PROPERTIES:START") && content.includes("### Properties")) {
      content = content.replace(/(###\s+Properties\s*\n)([\s\S]*?)(?=\n### |\n## |\n*$)/, "$1<!-- AUTO-GENERATED-PROPERTIES:START -->\n$2\n<!-- AUTO-GENERATED-PROPERTIES:END -->");
    }

    // Visuals (Layout and spacing)
    if (!content.includes("AUTO-GENERATED-VISUALS:START") && content.includes("### Layout and spacing")) {
      content = content.replace(/(###\s+Per-variant attributes[\s\S]*?###\s+Layout and spacing\s*\n[\s\S]*?)(?=\n### |\n## |\n*$)/, "<!-- AUTO-GENERATED-VISUALS:START -->\n$1\n<!-- AUTO-GENERATED-VISUALS:END -->");
    }

    // Variants (usually ## Variants)
    if (!content.includes("AUTO-GENERATED-VARIANTS:START") && content.includes("## Variants")) {
      content = content.replace(/(##\s+Variants\s*\n)([\s\S]*?)(?=\n## |\n*$)/, "$1<!-- AUTO-GENERATED-VARIANTS:START -->\n$2\n<!-- AUTO-GENERATED-VARIANTS:END -->");
    }

    if (content !== original) {
      await fs.writeFile(fullPath, content, "utf-8");
      migrated++;
      console.log(`[MIGRATED] ${file}`);
    }
  }
  console.log(`\nMigration complete. Wrapped ${migrated} files with boundary tags.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
