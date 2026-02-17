#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      args[key] = "true";
      continue;
    }
    args[key] = value;
    i += 1;
  }
  return args;
}

function parseTableRow(line) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function isTableSeparator(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function isLikelyTableRow(line) {
  return /\|/.test(line);
}

function normalizeText(text) {
  return text.replace(/\s+/g, " ").trim();
}

function parseMarkdown(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        level: headingMatch[1].length,
        text: normalizeText(headingMatch[2]),
      });
      i += 1;
      continue;
    }

    const fenceMatch = trimmed.match(/^```([a-zA-Z0-9_-]+)?\s*$/);
    if (fenceMatch) {
      const language = fenceMatch[1] || "";
      i += 1;
      const codeLines = [];
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      blocks.push({
        type: "code_block",
        language,
        text: codeLines.join("\n"),
      });
      continue;
    }

    if (
      i + 1 < lines.length &&
      isLikelyTableRow(line) &&
      isTableSeparator(lines[i + 1])
    ) {
      const header = parseTableRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length) {
        const current = lines[i];
        const currentTrimmed = current.trim();
        if (!currentTrimmed || !isLikelyTableRow(current)) break;
        if (!isTableSeparator(current)) rows.push(parseTableRow(current));
        i += 1;
      }
      blocks.push({
        type: "table",
        header,
        rows,
      });
      continue;
    }

    const unorderedMatch = trimmed.match(/^[-*]\s+(.+)$/);
    const orderedMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (unorderedMatch || orderedMatch) {
      const ordered = Boolean(orderedMatch);
      const items = [];
      let index = 1;

      while (i < lines.length) {
        const candidate = lines[i].trim();
        if (!candidate) break;
        if (ordered) {
          const m = candidate.match(/^(\d+)\.\s+(.+)$/);
          if (!m) break;
          items.push({ index, text: normalizeText(m[2]) });
          index += 1;
        } else {
          const m = candidate.match(/^[-*]\s+(.+)$/);
          if (!m) break;
          items.push({ text: normalizeText(m[1]) });
        }
        i += 1;
      }

      blocks.push({
        type: "list",
        ordered,
        items,
      });
      continue;
    }

    const paragraphLines = [];
    while (i < lines.length) {
      const candidate = lines[i];
      const candidateTrimmed = candidate.trim();
      if (!candidateTrimmed) break;
      if (/^(#{1,6})\s+/.test(candidateTrimmed)) break;
      if (/^```/.test(candidateTrimmed)) break;
      if (/^[-*]\s+/.test(candidateTrimmed)) break;
      if (/^\d+\.\s+/.test(candidateTrimmed)) break;
      if (
        i + 1 < lines.length &&
        isLikelyTableRow(candidate) &&
        isTableSeparator(lines[i + 1])
      ) {
        break;
      }
      paragraphLines.push(candidateTrimmed);
      i += 1;
    }

    if (paragraphLines.length > 0) {
      blocks.push({
        type: "paragraph",
        text: normalizeText(paragraphLines.join(" ")),
      });
      continue;
    }

    i += 1;
  }

  return blocks;
}

function summarizeBlocks(blocks) {
  const stats = {
    headings: 0,
    paragraphs: 0,
    lists: 0,
    tables: 0,
    codeBlocks: 0,
  };
  for (const block of blocks) {
    if (block.type === "heading") stats.headings += 1;
    if (block.type === "paragraph") stats.paragraphs += 1;
    if (block.type === "list") stats.lists += 1;
    if (block.type === "table") stats.tables += 1;
    if (block.type === "code_block") stats.codeBlocks += 1;
  }
  return stats;
}

function deriveTitle(blocks, fallbackName) {
  const h1 = blocks.find((block) => block.type === "heading" && block.level === 1);
  return h1?.text || fallbackName || "Untitled";
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const markdownPath = args.markdown;
  if (!markdownPath) {
    console.error(
      "Missing --markdown. Example: --markdown docs/design_system/components/alert.md"
    );
    process.exit(1);
  }

  const componentName =
    args["component-name"] ||
    path.basename(markdownPath, path.extname(markdownPath));
  const outPath =
    args.out ||
    `docs/design_system/_generated/figma_doc_models/${componentName.toLowerCase()}.doc-model.json`;

  const markdown = fs.readFileSync(markdownPath, "utf8");
  const blocks = parseMarkdown(markdown);
  const model = {
    version: 1,
    componentName,
    markdownPath,
    generatedAt: new Date().toISOString(),
    title: deriveTitle(blocks, componentName),
    blocks,
    stats: summarizeBlocks(blocks),
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(model, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        markdownPath,
        outPath,
        componentName,
        stats: model.stats,
        totalBlocks: blocks.length,
      },
      null,
      2
    )
  );
}

main();
