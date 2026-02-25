#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ZONES = ["ANATOMY", "PROPERTIES", "VISUALS", "VARIANTS"];

async function main() {
  const mdDir = path.resolve(process.cwd(), "docs/components");
  
  try {
    const stat = await fs.stat(mdDir);
    if (!stat.isDirectory()) throw new Error();
  } catch {
    console.error(`Docs directory not found: ${mdDir}`);
    process.exit(1);
  }

  const files = await fs.readdir(mdDir);
  const mdFiles = files.filter(f => f.endsWith(".md") && !f.startsWith("_"));

  let totalMissing = 0;
  for (const file of mdFiles) {
    const fullPath = path.join(mdDir, file);
    const content = await fs.readFile(fullPath, "utf-8");
    
    const missingZones = ZONES.filter(zone => !content.includes(`<!-- AUTO-GENERATED-${zone}:START -->`));
    if (missingZones.length > 0) {
      console.log(`[WARN] ${file} is missing boundary tags: ${missingZones.join(", ")}`);
      totalMissing++;
    }
  }

  console.log(`\nScan complete. ${totalMissing} components lack strict zonal boundaries.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
