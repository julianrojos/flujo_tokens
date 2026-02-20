#!/usr/bin/env node

import crypto from "node:crypto";
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
import { syncDocumentationIndices } from "./lib/component-registry/index.mjs";

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
      name: "--proof-image-dir <path>",
      description:
        "Output directory for local visual proof images.",
      defaultValue: "docs/_generated/visual-proofs/images",
    },
    {
      name: "--store-local-image <true|false>",
      description:
        "Download screenshot URL and persist a local image for deterministic dashboard rendering.",
      defaultValue: "true",
    },
    {
      name: "--require-local-image <true|false>",
      description:
        "Fail when local image persistence fails.",
      defaultValue: "true",
    },
    {
      name: "--download-timeout-ms <number>",
      description: "Timeout for screenshot URL download in milliseconds.",
      defaultValue: "30000",
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

function parseBooleanOption(rawValue, optionName, fallback = false) {
  const normalized = String(rawValue ?? fallback).trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error(`Invalid ${optionName} value: ${rawValue}. Allowed: true, false.`);
}

function parsePositiveInteger(rawValue, optionName, fallback) {
  const parsed = Number(rawValue ?? fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `Invalid ${optionName} value: ${rawValue}. Expected a positive number.`,
    );
  }
  return Math.floor(parsed);
}

function writeBufferAtomic(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, data);
  fs.renameSync(tempPath, filePath);
}

function writeTextAtomic(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, content, "utf8");
  fs.renameSync(tempPath, filePath);
}

function sha256Hex(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function contentTypeToExtension(contentType) {
  const value = String(contentType || "").trim().toLowerCase();
  if (value.includes("image/png")) return "png";
  if (value.includes("image/jpeg")) return "jpg";
  if (value.includes("image/webp")) return "webp";
  if (value.includes("image/svg+xml")) return "svg";
  if (value.includes("application/pdf")) return "pdf";
  return "";
}

function normalizeImageExtension(format, contentType, imageUrl) {
  const byContentType = contentTypeToExtension(contentType);
  if (byContentType) return byContentType;

  const byFormat = String(format || "").trim().toLowerCase();
  if (["png", "jpg", "jpeg", "webp", "svg", "pdf"].includes(byFormat)) {
    return byFormat === "jpeg" ? "jpg" : byFormat;
  }

  let pathname = "";
  try {
    pathname = new URL(String(imageUrl || "")).pathname;
  } catch {
    pathname = "";
  }
  const ext = path.extname(pathname).replace(/^\./, "").toLowerCase();
  if (["png", "jpg", "jpeg", "webp", "svg", "pdf"].includes(ext)) {
    return ext === "jpeg" ? "jpg" : ext;
  }

  return "png";
}

function extractImageDimensions(buffer, extension) {
  const ext = String(extension || "").toLowerCase();

  if (ext === "png" && buffer.length >= 24) {
    const signature = buffer.subarray(0, 8);
    const expected = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    if (signature.equals(expected)) {
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      if (width > 0 && height > 0) return { width, height };
    }
    return { width: null, height: null };
  }

  if ((ext === "jpg" || ext === "jpeg") && buffer.length >= 4) {
    if (buffer[0] !== 0xff || buffer[1] !== 0xd8) {
      return { width: null, height: null };
    }

    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      if (marker === 0xd8 || marker === 0xd9) {
        offset += 2;
        continue;
      }
      const segmentLength = buffer.readUInt16BE(offset + 2);
      if (segmentLength < 2) break;

      const isSof =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);

      if (isSof && offset + 8 < buffer.length) {
        const height = buffer.readUInt16BE(offset + 5);
        const width = buffer.readUInt16BE(offset + 7);
        if (width > 0 && height > 0) return { width, height };
        break;
      }

      offset += 2 + segmentLength;
    }
  }

  return { width: null, height: null };
}

async function downloadBinary(url, timeoutMs) {
  if (typeof fetch !== "function") {
    throw new Error("Global fetch is unavailable. Use Node.js 18+.");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "*/*" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      contentType: String(response.headers.get("content-type") || "").trim(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (String(message).toLowerCase().includes("abort")) {
      throw new Error(`Download timed out after ${timeoutMs}ms.`);
    }
    throw new Error(message);
  } finally {
    clearTimeout(timer);
  }
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

async function main() {
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
  const docsRootDir =
    path.basename(docsRootInput) === "components"
      ? path.dirname(docsRootInput)
      : docsRootInput;
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
    args["proof-dir"] || path.join(docsRootDir, "_generated", "visual-proofs"),
  );
  const proofImageDir = path.resolve(
    args["proof-image-dir"] ||
      path.join(docsRootDir, "_generated", "visual-proofs", "images"),
  );
  const format = String(args.format || "png").trim().toLowerCase();
  const scale = Number(args.scale || 2);
  const figmaUrl = String(args.url || "").trim();
  const agent = String(args.agent || process.env.DS_AGENT || "auto");
  const dryRun = parseBooleanOption(args["dry-run"], "--dry-run", false);
  const storeLocalImage = parseBooleanOption(
    args["store-local-image"],
    "--store-local-image",
    true,
  );
  const requireLocalImage = parseBooleanOption(
    args["require-local-image"],
    "--require-local-image",
    true,
  );
  const downloadTimeoutMs = parsePositiveInteger(
    args["download-timeout-ms"],
    "--download-timeout-ms",
    30000,
  );

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
  const localImageInfo = {
    path: null,
    sha256: null,
    bytes: null,
    contentType: null,
    width: null,
    height: null,
  };

  if (storeLocalImage) {
    try {
      const downloaded = await downloadBinary(imageUrlRaw, downloadTimeoutMs);
      const extension = normalizeImageExtension(
        format,
        downloaded.contentType,
        imageUrlRaw,
      );
      const localImagePath = path.join(
        proofImageDir,
        `${componentSlug || "component"}.${extension}`,
      );
      const dimensions = extractImageDimensions(downloaded.buffer, extension);

      if (!dryRun) {
        writeBufferAtomic(localImagePath, downloaded.buffer);
      }

      localImageInfo.path = localImagePath;
      localImageInfo.sha256 = sha256Hex(downloaded.buffer);
      localImageInfo.bytes = downloaded.buffer.byteLength;
      localImageInfo.contentType =
        downloaded.contentType || `image/${extension}`;
      localImageInfo.width = dimensions.width;
      localImageInfo.height = dimensions.height;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (requireLocalImage) {
        console.error(
          `Unable to persist local visual proof image: ${reason}`,
        );
        process.exit(1);
      }
      console.warn(
        `Warning: local visual proof image was not stored (${reason}).`,
      );
    }
  }

  const artifactPathForMarkdown =
    (
      path.relative(path.dirname(markdownPath), proofFilePath) ||
      path.basename(proofFilePath)
    ).split(path.sep).join("/");
  const localImagePathForMarkdown = localImageInfo.path
    ? (
        path.relative(path.dirname(markdownPath), localImageInfo.path) ||
        path.basename(localImageInfo.path)
      ).split(path.sep).join("/")
    : "";
  const localImagePathForJson = localImageInfo.path
    ? path.relative(docsRootDir, localImageInfo.path).split(path.sep).join("/")
    : null;

  const proofPayload = {
    component: componentSlug || path.basename(markdownPath, path.extname(markdownPath)),
    markdown_path: markdownPath,
    spec_path: specPath,
    source_url: figmaUrl || undefined,
    node_id: normalizedNodeId,
    format,
    scale,
    screenshot_url: imageUrlRaw,
    image_url: imageUrlRaw,
    image_path: localImagePathForJson,
    image_sha256: localImageInfo.sha256,
    image_bytes: localImageInfo.bytes,
    image_content_type: localImageInfo.contentType,
    image_width: localImageInfo.width,
    image_height: localImageInfo.height,
    captured_at: capturedAt,
    captured_with: "figma_take_screenshot",
    image: {
      path: localImagePathForJson,
      sha256: localImageInfo.sha256,
      bytes: localImageInfo.bytes,
      content_type: localImageInfo.contentType,
      width: localImageInfo.width,
      height: localImageInfo.height,
    },
  };

  const rawMarkdown = fs.readFileSync(markdownPath, "utf8");
  const { frontmatterRaw, content } = splitFrontmatter(rawMarkdown);
  const capturedDate = capturedAt.slice(0, 10);
  const visualSectionLines = [
    "### Visual Proof",
    "",
    ...(localImagePathForMarkdown
      ? [`![Visual proof snapshot](${localImagePathForMarkdown})`, ""]
      : []),
    `- Screenshot: [Captured (${capturedDate})](${imageUrlRaw})`,
    `- Source node: \`${normalizedNodeId}\``,
    ...(localImageInfo.sha256
      ? [`- Image hash: \`${localImageInfo.sha256}\``]
      : []),
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
    writeTextAtomic(
      proofFilePath,
      `${JSON.stringify(proofPayload, null, 2)}\n`,
    );
    const markdownPrefix = frontmatterRaw
      ? `${frontmatterRaw}\n`
      : "";
    writeTextAtomic(
      markdownPath,
      `${markdownPrefix}${nextContent.replace(/^\n+/, "")}`,
    );
    syncDocumentationIndices({
      docsDir: componentDocsDir,
      overviewPath: path.join(componentDocsDir, "overview.md"),
      specsDir: path.dirname(specPath),
      proofsDir: proofDir,
      renderDir: path.join(docsRootDir, "_generated", "figma_doc_models"),
      registryPath: path.join(docsRootDir, "_generated", "component-registry.json"),
    });
  }

  const report = {
    ok: true,
    dryRun,
    component: componentSlug,
    markdownPath,
    specPath,
    proofFilePath,
    localImagePath: localImageInfo.path,
    screenshotUrl: imageUrlRaw,
    nodeId: normalizedNodeId,
    format,
    scale,
    imageSha256: localImageInfo.sha256,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
