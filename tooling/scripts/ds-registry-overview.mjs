#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import { parseArgs, printUsage } from "./lib/parse-args.mjs";
import {
  DEFAULT_COMPONENT_OVERVIEW_PATH,
  DEFAULT_COMPONENT_REGISTRY_PATH,
  readComponentRegistry,
} from "./lib/component-registry/index.mjs";
import { normalizeSortKey } from "./lib/component-registry/utils.mjs";

const USAGE = {
  command: "npm run ds:registry:overview [-- --dry-run true]",
  description:
    "Regenerate docs/components/overview.md component list from the component registry.",
  options: [
    {
      name: "--registry <path>",
      description: "Component registry path.",
      defaultValue: "docs/_generated/component-registry.json",
    },
    {
      name: "--overview <path>",
      description: "Overview markdown path.",
      defaultValue: "docs/components/overview.md",
    },
    {
      name: "--dry-run <true|false>",
      description: "Report pending changes without writing files.",
      defaultValue: "false",
    },
    {
      name: "--help",
      description: "Show this help message.",
    },
  ],
};

function buildComponentListLines(components) {
  const entries = components
    .filter((component) => component.doc?.exists)
    .map((component) => ({
      displayName: String(component.display_name || "").trim(),
      target: `${component.slug}.md`,
    }))
    .sort((a, b) => {
      const keyA = normalizeSortKey(a.displayName);
      const keyB = normalizeSortKey(b.displayName);
      const byName = keyA.localeCompare(keyB, "en", { sensitivity: "base" });
      if (byName !== 0) return byName;
      return a.target.localeCompare(b.target, "en", { sensitivity: "base" });
    });

  return entries.map((entry) => `- [${entry.displayName}](${entry.target})`);
}

function upsertComponentList(markdown, componentListLines) {
  const source = String(markdown || "").replace(/\r\n/g, "\n");
  const sectionHeading = /^##\s+Component list\s*$/im;
  const headingMatch = sectionHeading.exec(source);

  const sectionBody = componentListLines.length > 0
    ? `${componentListLines.join("\n")}\n`
    : "";

  if (!headingMatch) {
    const trimmed = source.replace(/\s+$/, "");
    const separator = trimmed ? "\n\n" : "";
    return `${trimmed}${separator}## Component list\n\n${sectionBody}`;
  }

  const headingStart = headingMatch.index;
  const headingLineEnd = source.indexOf("\n", headingStart);
  const bodyStart = headingLineEnd === -1 ? source.length : headingLineEnd + 1;
  const remaining = source.slice(bodyStart);
  const nextH2Match = /^##\s+/m.exec(remaining);
  const bodyEnd = nextH2Match ? bodyStart + nextH2Match.index : source.length;

  const before = source.slice(0, bodyStart).replace(/\s*$/, "\n\n");
  const after = source.slice(bodyEnd).replace(/^\n*/, "\n");
  return `${before}${sectionBody}${after}`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (String(args.help || "false") === "true") {
    printUsage(USAGE, { exitCode: 0 });
  }

  const dryRun = String(args["dry-run"] || "false") === "true";
  const registryPath = path.resolve(args.registry || DEFAULT_COMPONENT_REGISTRY_PATH);
  const overviewPath = path.resolve(args.overview || DEFAULT_COMPONENT_OVERVIEW_PATH);

  if (!fs.existsSync(overviewPath)) {
    process.stderr.write(`Overview file not found: ${overviewPath}\n`);
    process.exit(1);
  }

  try {
    const { registry } = readComponentRegistry(registryPath);
    const componentListLines = buildComponentListLines(registry.components || []);

    const currentMarkdown = fs.readFileSync(overviewPath, "utf8");
    const nextMarkdown = upsertComponentList(currentMarkdown, componentListLines);
    const changed = nextMarkdown !== currentMarkdown;

    if (changed && !dryRun) {
      fs.writeFileSync(overviewPath, nextMarkdown, "utf8");
    }

    const report = {
      ok: true,
      dryRun,
      changed,
      written: changed && !dryRun,
      overviewPath,
      registryPath,
      componentCount: componentListLines.length,
    };

    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

main();
