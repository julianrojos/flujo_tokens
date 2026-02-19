#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import { parseArgs, printUsage } from "./lib/parse-args.mjs";
import { runAgentPrompt } from "./lib/agent-runner.mjs";
import { parseYamlDocument } from "./lib/parse-frontmatter.mjs";
import {
  componentNameToSnakeCase,
  normalizeComponentName,
} from "./lib/component-name.mjs";
import { DOCS_ROOT, DOCS_SPEC_DIR } from "./lib/paths.mjs";
import { normalizeNodeId } from "./lib/node-id.mjs";
import { syncComponentRegistry } from "./lib/component-registry/index.mjs";

const NODE_ID_RE = /^[A-Za-z0-9]+:[A-Za-z0-9]+$/;

const USAGE = {
  command:
    "npm run ds:capture-visual-proof -- --component-name Alert [--agent codex]",
  description:
    "Capture a Figma screenshot proof and upsert `### Visual Proof` under `## Overview` for a component markdown doc.",
  options: [
    {
      name: "--component-name <name>",
      description:
        "Component display name used to infer markdown/spec file paths.",
    },
    {
      name: "--markdown <path>",
      description: "Explicit markdown path (defaults to docs/components/<slug>.md).",
    },
    {
      name: "--spec-file <path>",
      description: "Explicit spec path (defaults to docs/_spec/components/<slug>.yml).",
    },
    {
      name: "--component-set-id <node-id>",
      description: "Explicit Figma component set node id (overrides spec value).",
    },
    {
      name: "--url <figma-url>",
      description: "Optional Figma URL context for the agent.",
    },
    {
      name: "--agent <codex|claude|gemini|auto>",
      description: "Agent CLI used to execute MCP screenshot capture.",
      defaultValue: "auto",
    },
    {
      name: "--format <png|jpg|svg|pdf>",
      description: "Screenshot format passed to figma_take_screenshot.",
      defaultValue: "png",
    },
    {
      name: "--scale <number>",
      description: "Screenshot scale passed to figma_take_screenshot.",
      defaultValue: "2",
    },
    {
      name: "--proof-dir <path>",
      description: "Output directory for visual proof metadata JSON.",
      defaultValue: "docs/_generated/visual-proofs",
    },
    {
      name: "--dry-run <true|false>",
      description: "Report changes without writing files.",
      defaultValue: "false",
    },
    {
      name: "--help",
      description: "Show this help message.",
    },
  ],
};

function isValidNodeId(value) {
  return NODE_ID_RE.test(String(value || "").trim());
}

function splitFrontmatter(rawMarkdown) {
  const source = String(rawMarkdown || "").replace(/\r\n/g, "\n");
  if (!source.startsWith("---\n")) {
    return { frontmatterRaw: "", content: source };
  }
  const lines = source.split("\n");
  let endIndex = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === "---") {
      endIndex = i;
      break;
    }
  }
  if (endIndex === -1) {
    return { frontmatterRaw: "", content: source };
  }
  const frontmatterRaw = `${lines.slice(0, endIndex + 1).join("\n")}\n`;
  const content = lines.slice(endIndex + 1).join("\n").replace(/^\n/, "");
  return { frontmatterRaw, content };
}

function extractFirstJsonObject(rawText) {
  const text = String(rawText || "").trim();
  if (!text) return null;

  const tryParse = (candidate) => {
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  };

  const direct = tryParse(text);
  if (direct && typeof direct === "object") return direct;

  const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i);
  if (fencedMatch) {
    const parsed = tryParse(fencedMatch[1].trim());
    if (parsed && typeof parsed === "object") return parsed;
  }

  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === "\"") {
        inString = false;
      }
      continue;
    }
    if (ch === "\"") {
      inString = true;
      continue;
    }
    if (ch === "{") {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }
    if (ch === "}") {
      if (depth > 0) depth -= 1;
      if (depth === 0 && start !== -1) {
        const candidate = text.slice(start, i + 1);
        const parsed = tryParse(candidate);
        if (parsed && typeof parsed === "object") return parsed;
        start = -1;
      }
    }
  }

  return null;
}

function resolveNodeId({ cliNodeIdRaw, specPath }) {
  const cliNodeId = normalizeNodeId(String(cliNodeIdRaw || "").trim());
  if (cliNodeId) {
    if (!isValidNodeId(cliNodeId)) {
      throw new Error(
        `Invalid --component-set-id format: ${cliNodeIdRaw}. Expected 123:456.`,
      );
    }
    return cliNodeId;
  }

  if (!fs.existsSync(specPath)) {
    throw new Error(
      `Missing spec file and no --component-set-id provided: ${specPath}`,
    );
  }

  const spec = parseYamlDocument(
    fs.readFileSync(specPath, "utf8"),
    `spec YAML (${path.basename(specPath)})`,
  );
  const figma =
    spec && typeof spec.figma === "object" && !Array.isArray(spec.figma)
      ? spec.figma
      : {};
  const nodeId = normalizeNodeId(String(figma.component_set_node_id || "").trim());
  if (!nodeId || !isValidNodeId(nodeId)) {
    throw new Error(
      "Unable to resolve a valid figma.component_set_node_id from spec. " +
        "Provide --component-set-id explicitly or update the spec.",
    );
  }
  return nodeId;
}

function upsertVisualProofInOverview(content, visualSectionLines) {
  const source = String(content || "");
  const overviewMatch = /^##\s+Overview\s*$/m.exec(source);
  if (!overviewMatch) {
    throw new Error(
      "Missing `## Overview` section. Visual proof must be nested inside Overview as `### Visual Proof`.",
    );
  }

  const overviewStart = overviewMatch.index;
  const overviewHeadingEnd = source.indexOf("\n", overviewStart);
  const overviewContentStart =
    overviewHeadingEnd === -1 ? source.length : overviewHeadingEnd + 1;
  const afterOverview = source.slice(overviewContentStart);
  const nextH2Match = /^##\s+/m.exec(afterOverview);
  const overviewEnd = nextH2Match
    ? overviewContentStart + nextH2Match.index
    : source.length;

  const beforeOverview = source.slice(0, overviewContentStart);
  const overviewBody = source.slice(overviewContentStart, overviewEnd);
  const afterSection = source.slice(overviewEnd);

  const lines = overviewBody.replace(/\n+$/, "").split("\n");
  const visualHeadingIndex = lines.findIndex((line) =>
    /^###\s+Visual Proof\s*$/.test(line.trim()),
  );

  if (visualHeadingIndex === -1) {
    const nextLines = [...lines];
    if (nextLines.length > 0 && nextLines[nextLines.length - 1].trim() !== "") {
      nextLines.push("");
    }
    nextLines.push(...visualSectionLines);
    return `${beforeOverview}${nextLines.join("\n")}\n${afterSection.replace(/^\n*/, "\n")}`;
  }

  let endIndex = lines.length;
  for (let i = visualHeadingIndex + 1; i < lines.length; i += 1) {
    if (/^###\s+/.test(lines[i].trim())) {
      endIndex = i;
      break;
    }
  }
  const nextLines = [
    ...lines.slice(0, visualHeadingIndex),
    ...visualSectionLines,
    ...lines.slice(endIndex),
  ];
  return `${beforeOverview}${nextLines.join("\n")}\n${afterSection.replace(/^\n*/, "\n")}`;
}

function buildCapturePrompt({
  figmaUrl,
  nodeId,
  format,
  scale,
}) {
  return [
    "Context",
    "- Capture a screenshot proof for a component node in Figma.",
    "",
    "Sources",
    figmaUrl ? `- Figma URL: ${figmaUrl}` : "",
    `- Target node id: ${nodeId}`,
    "",
    "Constraints",
    "- Use figma_take_screenshot with the provided node id.",
    `- Use format: ${format}.`,
    `- Use scale: ${scale}.`,
    "- Do not modify any Figma node.",
    "- Return JSON only. No markdown fences, no prose.",
    "",
    "Expected Output",
    '{ "image_url": "<https-url>", "node_id": "123:456", "format": "png", "scale": 2 }',
  ]
    .filter(Boolean)
    .join("\n");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (String(args.help || "false") === "true") {
    printUsage(USAGE, { exitCode: 0 });
  }

  const componentInput = String(args["component-name"] || "").trim();
  const normalizedComponent = normalizeComponentName(componentInput);
  const explicitMarkdownPath = String(args.markdown || "").trim();
  const slugFromMarkdown = explicitMarkdownPath
    ? path.basename(explicitMarkdownPath, path.extname(explicitMarkdownPath))
    : "";
  const componentSlug =
    normalizedComponent.fileSlug ||
    componentNameToSnakeCase(componentInput) ||
    slugFromMarkdown;

  if (!componentSlug && !explicitMarkdownPath) {
    console.error(
      "Missing --component-name or --markdown. One of them is required.",
    );
    printUsage(USAGE, { stream: "stderr", exitCode: 1 });
  }

  const docsRootInput = path.resolve(args["docs-root"] || DOCS_ROOT);
  const componentDocsDir =
    path.basename(docsRootInput) === "components"
      ? docsRootInput
      : path.join(docsRootInput, "components");
  const specRoot = path.resolve(
    args["spec-root"] || path.join(DOCS_SPEC_DIR, "components"),
  );
  const markdownPath = path.resolve(
    explicitMarkdownPath || path.join(componentDocsDir, `${componentSlug}.md`),
  );
  const specPath = path.resolve(
    args["spec-file"] || path.join(specRoot, `${componentSlug}.yml`),
  );
  const proofDir = path.resolve(
    args["proof-dir"] || path.join(DOCS_ROOT, "_generated", "visual-proofs"),
  );
  const format = String(args.format || "png").trim().toLowerCase();
  const scale = Number(args.scale || 2);
  const figmaUrl = String(args.url || "").trim();
  const agent = String(args.agent || process.env.DS_AGENT || "auto");
  const dryRun = String(args["dry-run"] || "false") === "true";

  if (!fs.existsSync(markdownPath)) {
    console.error(`Markdown file not found: ${markdownPath}`);
    process.exit(1);
  }
  if (!Number.isFinite(scale) || scale <= 0) {
    console.error(`Invalid --scale value: ${args.scale}`);
    process.exit(1);
  }

  let nodeId = "";
  try {
    nodeId = resolveNodeId({
      cliNodeIdRaw: args["component-set-id"],
      specPath,
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const prompt = buildCapturePrompt({ figmaUrl, nodeId, format, scale });
  let response;
  try {
    response = runAgentPrompt({
      prompt,
      agent,
      label: `capture-visual-proof-${componentSlug || "component"}`,
      passthrough: false,
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const payload = extractFirstJsonObject(response.stdout || "");
  if (!payload || typeof payload !== "object") {
    console.error(
      "Unable to parse JSON screenshot payload from agent output. " +
        "Run again with --agent codex and verify MCP connectivity.",
    );
    process.exit(1);
  }

  const imageUrlRaw =
    String(payload.image_url || payload.url || payload.imageUrl || "").trim();
  const nodeIdRaw = String(payload.node_id || payload.nodeId || nodeId).trim();
  const normalizedNodeId = normalizeNodeId(nodeIdRaw) || nodeId;

  if (!/^https?:\/\/\S+$/i.test(imageUrlRaw)) {
    console.error(
      `Agent output did not include a valid screenshot URL. Received: ${imageUrlRaw || "<empty>"}`,
    );
    process.exit(1);
  }
  if (!isValidNodeId(normalizedNodeId)) {
    console.error(
      `Agent output did not include a valid node id. Received: ${nodeIdRaw || "<empty>"}`,
    );
    process.exit(1);
  }

  const capturedAt = new Date().toISOString();
  const proofFilePath = path.join(
    proofDir,
    `${componentSlug || "component"}.json`,
  );
  const artifactPathForMarkdown = path.relative(
    path.dirname(markdownPath),
    proofFilePath,
  ) || path.basename(proofFilePath);

  const proofPayload = {
    component: componentSlug || path.basename(markdownPath, path.extname(markdownPath)),
    markdown_path: markdownPath,
    spec_path: specPath,
    source_url: figmaUrl || undefined,
    node_id: normalizedNodeId,
    format,
    scale,
    image_url: imageUrlRaw,
    captured_at: capturedAt,
    captured_with: "figma_take_screenshot",
  };

  const rawMarkdown = fs.readFileSync(markdownPath, "utf8");
  const { frontmatterRaw, content } = splitFrontmatter(rawMarkdown);
  const capturedDate = capturedAt.slice(0, 10);
  const visualSectionLines = [
    "### Visual Proof",
    "",
    `- Screenshot: [Captured (${capturedDate})](${imageUrlRaw})`,
    `- Source node: \`${normalizedNodeId}\``,
    `- Artifact: \`${artifactPathForMarkdown}\``,
  ];

  let nextContent = "";
  try {
    nextContent = upsertVisualProofInOverview(content, visualSectionLines);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  if (!dryRun) {
    fs.mkdirSync(proofDir, { recursive: true });
    fs.writeFileSync(
      proofFilePath,
      `${JSON.stringify(proofPayload, null, 2)}\n`,
      "utf8",
    );
    const markdownPrefix = frontmatterRaw
      ? `${frontmatterRaw}\n`
      : "";
    fs.writeFileSync(
      markdownPath,
      `${markdownPrefix}${nextContent.replace(/^\n+/, "")}`,
      "utf8",
    );
    syncComponentRegistry();
  }

  const report = {
    ok: true,
    dryRun,
    component: componentSlug,
    markdownPath,
    specPath,
    proofFilePath,
    screenshotUrl: imageUrlRaw,
    nodeId: normalizedNodeId,
    format,
    scale,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main();
