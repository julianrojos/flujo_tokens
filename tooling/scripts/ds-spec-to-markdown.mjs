#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import yaml from "js-yaml";
import { pathToFileURL } from "node:url";

import { parseArgs, printUsage } from "./lib/parse-args.mjs";
import { injectSpecZones } from "./lib/spec-to-markdown-injector.mjs";

const USAGE = {
  command: "npm run ds:spec-to-markdown -- --slug alert",
  description: "Injects YAML component specifications into HTML boundaries within Markdown.",
  options: [
    { name: "--slug <name>", description: "Component slug to sync." },
    { name: "--spec-dir <path>", description: "Spec components directory.", defaultValue: "docs/_spec/components" },
    { name: "--md-dir <path>", description: "Markdown documentation directory.", defaultValue: "docs/components" },
    { name: "--check <true|false>", description: "CI read-only mode (exits 1 if desynced)", defaultValue: "false" },
    { name: "--dry-run <true|false>", description: "Console report what would change without touching disk", defaultValue: "false" },
    { name: "--help", description: "Show this help message." },
  ],
};

function extractZoneRowsLength(markdown, zoneName) {
  const startTag = `<!-- AUTO-GENERATED-${zoneName}:START -->`;
  const endTag = `<!-- AUTO-GENERATED-${zoneName}:END -->`;
  const startIdx = markdown.indexOf(startTag);
  const endIdx = markdown.indexOf(endTag);
  if (startIdx === -1 || endIdx === -1) return 0;
  const inner = markdown.slice(startIdx + startTag.length, endIdx);
  return inner.split("\n").filter(line => line.trim().length > 0).length;
}

function countLines(markdown) {
  return markdown.split("\n").length;
}

async function runSpecToMarkdown(args) {
  const slug = String(args.slug || "").trim();
  if (!slug) throw new Error("Missing --slug <name>");

  const specDir = path.resolve(process.cwd(), String(args["spec-dir"] || "docs/_spec/components"));
  const mdDir = path.resolve(process.cwd(), String(args["md-dir"] || "docs/components"));

  const isCheck = String(args.check || "false") === "true";
  const isDryRun = String(args.dryRun || args["dry-run"] || "false") === "true";

  const ymlPath = path.join(specDir, `${slug}.yml`);
  const mdPath = path.join(mdDir, `${slug}.md`);

  let specContent = "";
  let mdContent = "";

  try {
    specContent = await fs.readFile(ymlPath, "utf-8");
  } catch (err) {
    throw new Error(`YAML spec not found or unreadable: ${ymlPath}`);
  }

  try {
    mdContent = await fs.readFile(mdPath, "utf-8");
  } catch (err) {
    throw new Error(`Markdown file not found or unreadable: ${mdPath}. Prose scaffolds must exist.`);
  }

  const spec = yaml.load(specContent);
  const newMdContent = injectSpecZones(mdContent, spec, slug);

  const changed = mdContent !== newMdContent;

  if (isCheck) {
    if (changed) {
      console.error(`❌ [DESYNC] ${slug}.md is out of sync with ${slug}.yml.`);
      console.error(`Run 'npm run ds:spec-to-markdown -- --slug ${slug}' to fix.`);
      process.exit(1);
    } else {
      console.log(`✅ [SYNC] ${slug}.md matches ${slug}.yml`);
      return;
    }
  }

  if (isDryRun) {
    if (!changed) {
      console.log(`Would update: ${path.relative(process.cwd(), mdPath)} (No changes detected).`);
      return;
    }
    console.log(`Would update: ${path.relative(process.cwd(), mdPath)}`);
    const zones = ["ANATOMY", "PROPERTIES", "VISUALS", "VARIANTS"];
    for (const zone of zones) {
      const oldRows = extractZoneRowsLength(mdContent, zone);
      const newRows = extractZoneRowsLength(newMdContent, zone);
      if (oldRows !== newRows) {
        console.log(`  - AUTO-GENERATED-${zone}: ${oldRows} rows → ${newRows} rows`);
      }
    }
    const linesDiff = countLines(newMdContent) - countLines(mdContent);
    console.log(`Total line delta: ${linesDiff > 0 ? "+" : ""}${linesDiff}`);
    return;
  }

  if (!changed) {
    console.log(`[SKIPPED] ${slug}.md is already up to date.`);
    return;
  }

  // Pseudo-Atomic POSIX write via temp file
  const tmpPath = `${mdPath}.tmp.${Date.now()}`;
  try {
    await fs.writeFile(tmpPath, newMdContent, "utf-8");
    await fs.rename(tmpPath, mdPath);
    console.log(`[SUCCESS] Updated ${path.relative(process.cwd(), mdPath)}`);
  } catch (error) {
    await fs.unlink(tmpPath).catch(() => {});
    throw new Error(`Failed to write atomically: ${error.message}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (String(args.help || "false") === "true") {
    printUsage(USAGE, { stream: "stdout" });
    process.exit(0);
  }

  try {
    await runSpecToMarkdown(args);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

const isMainModule = !!process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMainModule) {
  main();
}
