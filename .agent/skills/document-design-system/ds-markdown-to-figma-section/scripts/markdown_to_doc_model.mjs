#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "../../../../../tooling/scripts/lib/parse-args.mjs";
import { parseMarkdownFrontmatter } from "../../../../../tooling/scripts/lib/parse-frontmatter.mjs";
import { FIGMA_DOC_MODELS_DIR } from "../../../../../tooling/scripts/lib/paths.mjs";

function parseTableRow(line) {
  const source = String(line == null ? "" : line).trim();
  const trimmed = source.replace(/^\|/, "").replace(/\|$/, "");
  const cells = [];
  let current = "";
  let inCode = false;

  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i];

    if (ch === "\\") {
      const next = trimmed[i + 1];
      if (next === "|" || next === "\\" || next === "`") {
        current += next;
        i += 1;
        continue;
      }
      current += ch;
      continue;
    }

    if (ch === "`") {
      inCode = !inCode;
      current += ch;
      continue;
    }

    if (ch === "|" && !inCode) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += ch;
  }

  cells.push(current.trim());
  return cells;
}

function isTableSeparator(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function isLikelyTableRow(line, { allowSinglePipe = false } = {}) {
  const source = String(line || "");
  const pipeCount = (source.match(/\|/g) || []).length;
  if (pipeCount < 2 && !(allowSinglePipe && pipeCount === 1)) return false;
  const trimmed = source.trim();
  if (!trimmed) return false;
  return true;
}

function normalizeText(text) {
  return text.replace(/\s+/g, " ").trim();
}

function pushInlineSegment(segments, text, style) {
  if (!text) return;
  const last = segments[segments.length - 1];
  if (last && last.style === style) {
    last.text += text;
    return;
  }
  segments.push({ text, style });
}

function parseInlineFormatting(raw) {
  const input = String(raw == null ? "" : raw);
  // Order matters: bold_italic (***) before bold (**) before italic (_) before code (`)
  const tokenRegex =
    /(\*\*\*([^*]+?)\*\*\*|\*\*([^*]+?)\*\*|_([^_\n]+?)_|`([^`\n]+?)`)/g;
  const segments = [];
  let plainText = "";
  let cursor = 0;

  let match;
  while ((match = tokenRegex.exec(input)) !== null) {
    const matchStart = match.index;
    if (matchStart > cursor) {
      const normalText = input.slice(cursor, matchStart);
      plainText += normalText;
      pushInlineSegment(segments, normalText, "normal");
    }

    let style = "normal";
    let styledText = "";
    if (match[2] != null) {
      style = "bold_italic";
      styledText = match[2];
    } else if (match[3] != null) {
      style = "bold";
      styledText = match[3];
    } else if (match[4] != null) {
      style = "italic";
      styledText = match[4];
    } else if (match[5] != null) {
      style = "code";
      styledText = match[5];
    }

    plainText += styledText;
    pushInlineSegment(segments, styledText, style);
    cursor = matchStart + match[0].length;
  }

  if (cursor < input.length) {
    const tail = input.slice(cursor);
    plainText += tail;
    pushInlineSegment(segments, tail, "normal");
  }

  return {
    text: plainText,
    segments,
  };
}

function parseMarkdown(markdown) {
  const lines = markdown.split("\n");
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
      const inline = parseInlineFormatting(normalizeText(headingMatch[2]));
      blocks.push({
        type: "heading",
        level: headingMatch[1].length,
        text: inline.text,
        segments: inline.segments,
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
      isLikelyTableRow(line, { allowSinglePipe: true }) &&
      isTableSeparator(lines[i + 1])
    ) {
      const parsedHeader = parseTableRow(line).map((cell) =>
        parseInlineFormatting(cell),
      );
      const header = parsedHeader.map((cell) => cell.text);
      const headerSegments = parsedHeader.map((cell) => cell.segments);
      i += 2;
      const rows = [];
      const rowSegments = [];
      while (i < lines.length) {
        const current = lines[i];
        const currentTrimmed = current.trim();
        if (!currentTrimmed || !isLikelyTableRow(current, { allowSinglePipe: true })) break;
        if (!isTableSeparator(current)) {
          const parsedRow = parseTableRow(current).map((cell) =>
            parseInlineFormatting(cell),
          );
          rows.push(parsedRow.map((cell) => cell.text));
          rowSegments.push(parsedRow.map((cell) => cell.segments));
        }
        i += 1;
      }
      blocks.push({
        type: "table",
        header,
        headerSegments,
        rows,
        rowSegments,
      });
      continue;
    }

    const unorderedMatch = line.match(/^(\s*)[-*]\s+(.+)$/);
    const orderedMatch = line.match(/^(\s*)(\d+)\.\s+(.+)$/);
    if (unorderedMatch || orderedMatch) {
      const ordered = Boolean(orderedMatch);
      const baseIndent = ordered
        ? orderedMatch[1].length
        : unorderedMatch[1].length;
      const indentStack = [baseIndent];
      const items = [];

      while (i < lines.length) {
        const rawCandidate = lines[i];
        const candidate = rawCandidate.trim();
        if (!candidate) break;
        const orderedItemMatch = rawCandidate.match(/^(\s*)(\d+)\.\s+(.+)$/);
        const unorderedItemMatch = rawCandidate.match(/^(\s*)[-*]\s+(.+)$/);
        const itemMatch = orderedItemMatch || unorderedItemMatch;
        if (!itemMatch) break;

        const indent = itemMatch[1].length;
        if (indent < baseIndent) break;

        while (
          indentStack.length > 1 &&
          indent < indentStack[indentStack.length - 1]
        ) {
          indentStack.pop();
        }
        if (indent > indentStack[indentStack.length - 1]) {
          indentStack.push(indent);
        }

        const depth = Math.max(0, indentStack.length - 1);
        const textIndex = orderedItemMatch ? 3 : 2;
        const inline = parseInlineFormatting(normalizeText(itemMatch[textIndex]));
        items.push({
          text: inline.text,
          segments: inline.segments,
          depth,
          ordered: Boolean(orderedItemMatch),
        });
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
        isLikelyTableRow(candidate, { allowSinglePipe: true }) &&
        isTableSeparator(lines[i + 1])
      ) {
        break;
      }
      paragraphLines.push(candidateTrimmed);
      i += 1;
    }

    if (paragraphLines.length > 0) {
      const inline = parseInlineFormatting(
        normalizeText(paragraphLines.join(" ")),
      );
      blocks.push({
        type: "paragraph",
        text: inline.text,
        segments: inline.segments,
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
  const h1 = blocks.find(
    (block) => block.type === "heading" && block.level === 1,
  );
  return h1?.text || fallbackName || "Untitled";
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const markdownPath = args.markdown;
  if (!markdownPath) {
    console.error(
      "Missing --markdown. Example: --markdown docs/components/alert.md",
    );
    process.exit(1);
  }

  const componentName =
    args["component-name"] ||
    path.basename(markdownPath, path.extname(markdownPath));
  const outPath =
    args.out ||
    `${FIGMA_DOC_MODELS_DIR}/${componentName.toLowerCase()}.doc-model.json`;

  const markdown = fs.readFileSync(markdownPath, "utf8");
  const { content } = parseMarkdownFrontmatter(markdown);
  const blocks = parseMarkdown(content);
  const model = {
    version: 2,
    componentName,
    markdownPath,
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
      2,
    ),
  );
}

main();
