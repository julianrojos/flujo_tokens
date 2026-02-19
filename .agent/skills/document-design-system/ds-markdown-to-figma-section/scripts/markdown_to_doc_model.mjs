#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "../../../../../tooling/scripts/lib/parse-args.mjs";
import { parseMarkdownFrontmatter } from "../../../../../tooling/scripts/lib/parse-frontmatter.mjs";
import { FIGMA_DOC_MODELS_DIR } from "../../../../../tooling/scripts/lib/paths.mjs";

function parseTableRow(line) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function isTableSeparator(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function isLikelyTableRow(line) {
  const source = String(line || "");
  const pipeCount = (source.match(/\|/g) || []).length;
  if (pipeCount < 2) return false;
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
      isLikelyTableRow(line) &&
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
        if (!currentTrimmed || !isLikelyTableRow(current)) break;
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
      const items = [];
      let index = 1;

      while (i < lines.length) {
        const rawCandidate = lines[i];
        const candidate = rawCandidate.trim();
        if (!candidate) break;
        if (ordered) {
          const m = rawCandidate.match(/^(\s*)(\d+)\.\s+(.+)$/);
          if (!m) break;
          if (m[1].length !== baseIndent) break;
          const inline = parseInlineFormatting(normalizeText(m[3]));
          items.push({ index, text: inline.text, segments: inline.segments });
          index += 1;
        } else {
          const m = rawCandidate.match(/^(\s*)[-*]\s+(.+)$/);
          if (!m) break;
          if (m[1].length !== baseIndent) break;
          const inline = parseInlineFormatting(normalizeText(m[2]));
          items.push({ text: inline.text, segments: inline.segments });
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
