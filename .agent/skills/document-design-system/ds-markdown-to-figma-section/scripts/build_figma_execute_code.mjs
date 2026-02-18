#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { parseYamlDocument } from "../../../../../tooling/scripts/lib/parse-frontmatter.mjs";
import { parseArgs } from "../../../../../tooling/scripts/lib/parse-args.mjs";
import { FIGMA_DOC_MODELS_DIR } from "../../../../../tooling/scripts/lib/paths.mjs";

function buildFigmaExecuteCode(payload) {
  const payloadJson = JSON.stringify(payload);
  return `const PAYLOAD = ${payloadJson};

function getPath(obj, path, fallbackValue) {
  const parts = path.split(".");
  let current = obj;
  for (const part of parts) {
    if (!current || !Object.prototype.hasOwnProperty.call(current, part)) {
      return fallbackValue;
    }
    current = current[part];
  }
  return current == null ? fallbackValue : current;
}

function hexToRgb(hex) {
  if (typeof hex !== "string") return { r: 0, g: 0, b: 0 };
  const cleaned = hex.trim().replace("#", "");
  const expanded =
    cleaned.length === 3
      ? cleaned.split("").map((c) => c + c).join("")
      : cleaned.padEnd(6, "0").slice(0, 6);
  const value = Number.parseInt(expanded, 16);
  return {
    r: ((value >> 16) & 255) / 255,
    g: ((value >> 8) & 255) / 255,
    b: (value & 255) / 255,
  };
}

function solid(hex, opacity) {
  return {
    type: "SOLID",
    color: hexToRgb(hex),
    opacity: opacity == null ? 1 : opacity,
  };
}

function resolveColor(theme, colorOrToken, fallbackHex) {
  if (typeof colorOrToken === "string" && colorOrToken.startsWith("#")) {
    return colorOrToken;
  }
  if (typeof colorOrToken === "string") {
    const tokenValue = getPath(theme, "theme.colors." + colorOrToken, null);
    if (typeof tokenValue === "string" && tokenValue.startsWith("#")) return tokenValue;
  }
  return fallbackHex;
}

function fontStyleFromWeight(weight) {
  if (!weight) return "Regular";
  const normalized = String(weight).toLowerCase();
  if (normalized === "bold") return "Bold";
  if (normalized === "semibold" || normalized === "semi-bold") return "SemiBold";
  if (normalized === "medium") return "Medium";
  return "Regular";
}

function addFontFamilyVariants(fontPairs, family, variants) {
  const safeFamily = String(family || "").trim();
  if (!safeFamily) return;
  for (const variant of variants) {
    fontPairs.add(safeFamily + ":" + variant);
  }
}

function setRangeFontNameSafe(node, start, end, family, styleCandidates) {
  const safeFamily = String(family || "").trim();
  if (!safeFamily || end <= start) return false;

  for (const rawStyle of styleCandidates) {
    const safeStyle = String(rawStyle || "").trim();
    if (!safeStyle) continue;
    try {
      node.setRangeFontName(start, end, { family: safeFamily, style: safeStyle });
      return true;
    } catch (_) {
      // Keep trying style fallbacks.
    }
  }
  return false;
}

function normalizeInlineSegments(rawSegments, fallbackText) {
  if (!Array.isArray(rawSegments) || rawSegments.length === 0) {
    return [{ text: String(fallbackText == null ? "" : fallbackText), style: "normal" }];
  }

  const segments = [];
  for (const rawSegment of rawSegments) {
    const text = String(rawSegment && rawSegment.text != null ? rawSegment.text : "");
    if (!text) continue;

    const style = String(rawSegment && rawSegment.style ? rawSegment.style : "normal");
    const safeStyle =
      style === "bold" || style === "italic" || style === "bold_italic" || style === "code" || style === "normal"
        ? style
        : "normal";

    const last = segments[segments.length - 1];
    if (last && last.style === safeStyle) {
      last.text += text;
    } else {
      segments.push({ text, style: safeStyle });
    }
  }

  if (segments.length === 0) {
    return [{ text: String(fallbackText == null ? "" : fallbackText), style: "normal" }];
  }

  return segments;
}

function segmentsToText(segments) {
  return segments.map((segment) => String(segment.text || "")).join("");
}

function applySegmentFormatting(node, segments, family, theme) {
  const monoFamily = String(getPath(theme, "theme.typography.font_family_mono", "Roboto Mono"));
  let offset = 0;

  for (const segment of segments) {
    const text = String(segment.text || "");
    const end = offset + text.length;
    if (end <= offset) continue;

    if (segment.style === "bold_italic") {
      setRangeFontNameSafe(node, offset, end, family, [
        "Bold Italic",
        "SemiBold Italic",
        "Bold",
        "Italic",
        "Regular",
      ]);
    } else if (segment.style === "bold") {
      setRangeFontNameSafe(node, offset, end, family, [
        "Bold",
        "SemiBold",
        "Medium",
        "Regular",
      ]);
    } else if (segment.style === "italic") {
      setRangeFontNameSafe(node, offset, end, family, [
        "Italic",
        "Medium Italic",
        "Regular",
      ]);
    } else if (segment.style === "code") {
      const appliedMono = setRangeFontNameSafe(node, offset, end, monoFamily, [
        "Regular",
        "Medium",
      ]);
      if (!appliedMono) {
        setRangeFontNameSafe(node, offset, end, family, [
          "Regular",
          "Medium",
        ]);
      }
    }

    offset = end;
  }
}

async function ensureFonts(theme) {
  const bodyFamily = getPath(theme, "theme.typography.font_family", "Nunito Sans");
  const headingFamily = getPath(theme, "theme.typography.font_family_heading", bodyFamily);
  const monoFamily = getPath(theme, "theme.typography.font_family_mono", "Roboto Mono");
  const typography = getPath(theme, "theme.typography", {});

  // Collect { family, style } pairs from all typography entries
  const fontPairs = new Set();
  const richTextVariants = [
    "Regular",
    "Bold",
    "Italic",
    "Bold Italic",
    "SemiBold",
    "SemiBold Italic",
    "Medium",
    "Medium Italic",
  ];
  addFontFamilyVariants(fontPairs, bodyFamily, richTextVariants);
  addFontFamilyVariants(fontPairs, headingFamily, richTextVariants);
  addFontFamilyVariants(fontPairs, monoFamily, ["Regular", "Medium"]);
  for (const [key, value] of Object.entries(typography)) {
    if (key === "font_family" || key === "font_family_heading") continue;
    if (!value || typeof value !== "object") continue;
    const fam = value.font_family || bodyFamily;
    addFontFamilyVariants(fontPairs, fam, [fontStyleFromWeight(value.weight)]);
  }

  for (const pair of fontPairs) {
    const [family, style] = pair.split(":");
    try {
      await figma.loadFontAsync({ family, style });
    } catch (error) {
      if (style !== "Regular") {
        try {
          await figma.loadFontAsync({ family, style: "Regular" });
        } catch (_) {
          // Skip unavailable font variant
        }
      }
    }
  }
}

function createVerticalFrame(name) {
  const frame = figma.createFrame();
  frame.name = name;
  frame.layoutMode = "VERTICAL";
  frame.primaryAxisSizingMode = "AUTO";
  frame.counterAxisSizingMode = "FIXED";
  frame.fills = [];
  return frame;
}

function createHorizontalFrame(name) {
  const frame = figma.createFrame();
  frame.name = name;
  frame.layoutMode = "HORIZONTAL";
  frame.primaryAxisSizingMode = "AUTO";
  frame.counterAxisSizingMode = "AUTO";
  frame.fills = [];
  return frame;
}

function createText(parent, text, styleKey, theme, options) {
  const typography = getPath(theme, "theme.typography", {});
  const style = typography[styleKey] || typography.body || {
    size: 15,
    line_height: 24,
    weight: "Regular",
    color: "body_text",
  };

  const defaultFamily = getPath(theme, "theme.typography.font_family", "Nunito Sans");
  const family = style.font_family || defaultFamily;
  const colorToken = options && options.colorOverride ? options.colorOverride : style.color;
  const wrap = options && Object.prototype.hasOwnProperty.call(options, "wrap")
    ? Boolean(options.wrap)
    : true;
  const wrapWidth = options && typeof options.wrapWidth === "number"
    ? Number(options.wrapWidth)
    : null;
  const colorHex = resolveColor(theme, colorToken, "#4E4343");

  const node = figma.createText();
  node.fontName = { family, style: fontStyleFromWeight(style.weight) };
  node.fontSize = Number(style.size || 15);
  node.lineHeight = { unit: "PIXELS", value: Number(style.line_height || 24) };
  node.fills = [solid(colorHex, 1)];
  if (wrap) {
    node.textAutoResize = "HEIGHT";
  } else {
    node.textAutoResize = "WIDTH_AND_HEIGHT";
  }
  const resolvedSegments = normalizeInlineSegments(options && options.segments, text);
  node.characters = segmentsToText(resolvedSegments);
  parent.appendChild(node);
  applySegmentFormatting(node, resolvedSegments, family, theme);
  if (wrap) {
    const parentWidth = "width" in parent ? Number(parent.width || 0) : 0;
    const padLeft = "paddingLeft" in parent ? Number(parent.paddingLeft || 0) : 0;
    const padRight = "paddingRight" in parent ? Number(parent.paddingRight || 0) : 0;
    const inferredWidth = Math.max(1, parentWidth - padLeft - padRight);
    const targetWidth = wrapWidth != null ? Math.max(1, wrapWidth) : inferredWidth;
    if (targetWidth > 1) {
      node.resize(targetWidth, node.height);
    }
  }
  return node;
}

function findAncestorSection(node) {
  let current = node.parent;
  while (current) {
    if (current.type === "SECTION") return current;
    current = current.parent;
  }
  return null;
}

function toSafeName(raw) {
  return String(raw || "")
    .replace(/[\\\\/:*?"<>|]/g, "-")
    .replace(/\\s+/g, " ")
    .trim();
}

function clearChildren(node) {
  for (const child of [...node.children]) {
    child.remove();
  }
}

function createCard(canvas, title, titleSegments, theme) {
  const card = createVerticalFrame("Card/" + toSafeName(title || "Untitled"));
  const cardWidth = Number(getPath(theme, "components.card.width", 820));
  const padding = getPath(theme, "components.card.padding", {});
  const padTop = Number(padding.top ?? 20);
  const padRight = Number(padding.right ?? 20);
  const padBottom = Number(padding.bottom ?? 20);
  const padLeft = Number(padding.left ?? 20);

  card.resizeWithoutConstraints(cardWidth, 100);
  card.layoutAlign = "STRETCH";
  card.paddingTop = padTop;
  card.paddingRight = padRight;
  card.paddingBottom = padBottom;
  card.paddingLeft = padLeft;
  card.itemSpacing = Number(getPath(theme, "components.card.item_spacing", 10));
  card.cornerRadius = Number(getPath(theme, "components.card.radius", getPath(theme, "theme.radii.card", 16)));
  card.fills = [solid(resolveColor(theme, getPath(theme, "components.card.fills.color", "card_bg"), "#FFFFFF"), 1)];
  card.strokes = [solid(resolveColor(theme, getPath(theme, "components.card.strokes.color", "card_border"), "#E7DDCF"), 1)];
  card.strokeWeight = Number(getPath(theme, "components.card.strokes.weight", 1));
  canvas.appendChild(card);

  createText(card, title, "h2", theme, { segments: titleSegments });
  return card;
}

function createChip(parent, label, theme) {
  const chip = createHorizontalFrame("Chip/" + toSafeName(label));
  chip.paddingTop = Number(getPath(theme, "theme.spacing.chip_padding_v", 6));
  chip.paddingBottom = Number(getPath(theme, "theme.spacing.chip_padding_v", 6));
  chip.paddingLeft = Number(getPath(theme, "theme.spacing.chip_padding_h", 10));
  chip.paddingRight = Number(getPath(theme, "theme.spacing.chip_padding_h", 10));
  chip.cornerRadius = Number(getPath(theme, "theme.radii.chip", 999));
  chip.strokes = [solid(resolveColor(theme, "chip_border", "#DCCBB2"), 1)];
  chip.strokeWeight = Number(getPath(theme, "theme.strokes.chip_border", 1));
  chip.fills = [solid(resolveColor(theme, "chip_bg", "#F6EFE4"), 1)];
  parent.appendChild(chip);
  createText(chip, label, "body_small", theme, {
    colorOverride: "chip_text",
    wrap: false,
  });
}

function resolveTableMinRowHeight(theme, cellPaddingV) {
  const configured = getPath(theme, "components.table_card.table.min_row_height", null);
  const configuredString = String(configured == null ? "" : configured).trim().toLowerCase();

  if (configuredString && configuredString !== "auto") {
    const configuredNumber = Number(configured);
    if (Number.isFinite(configuredNumber) && configuredNumber > 0) {
      return Math.ceil(configuredNumber);
    }
  }

  const bodySizeRaw = Number(getPath(theme, "theme.typography.body.size", 15));
  const bodyLineHeightRaw = Number(getPath(theme, "theme.typography.body.line_height", 24));
  const safeBodySize = Number.isFinite(bodySizeRaw) && bodySizeRaw > 0 ? bodySizeRaw : 15;
  const safeBodyLineHeight =
    Number.isFinite(bodyLineHeightRaw) && bodyLineHeightRaw > 0
      ? bodyLineHeightRaw
      : Math.ceil(safeBodySize * 1.2);
  const safePaddingV =
    Number.isFinite(cellPaddingV) && cellPaddingV >= 0 ? cellPaddingV : 8;

  const contentHeight = Math.max(safeBodyLineHeight, safeBodySize * 1.2);
  return Math.ceil(contentHeight + safePaddingV * 2);
}

function createTable(parent, title, tableBlock, theme) {
  const tableCard = createVerticalFrame("Table/" + toSafeName(title || "Table"));
  tableCard.layoutAlign = "STRETCH";
  tableCard.itemSpacing = 0;
  tableCard.fills = [];
  parent.appendChild(tableCard);

  const header = Array.isArray(tableBlock.header) ? tableBlock.header : [];
  const headerSegments = Array.isArray(tableBlock.headerSegments)
    ? tableBlock.headerSegments
    : [];
  const bodyRows = Array.isArray(tableBlock.rows) ? tableBlock.rows : [];
  const bodyRowSegments = Array.isArray(tableBlock.rowSegments)
    ? tableBlock.rowSegments
    : [];
  const columnCount = Math.max(
    header.length,
    ...bodyRows.map((row) => (Array.isArray(row) ? row.length : 0)),
    1
  );
  const rows = [];
  if (header.length > 0) {
    rows.push({
      cells: header,
      segments: Array.isArray(headerSegments) ? headerSegments : [],
      isHeader: true,
    });
  }
  for (let bodyRowIndex = 0; bodyRowIndex < bodyRows.length; bodyRowIndex += 1) {
    const row = bodyRows[bodyRowIndex];
    const safeRow = Array.isArray(row) ? row : [String(row)];
    rows.push({
      cells: safeRow,
      segments: Array.isArray(bodyRowSegments[bodyRowIndex])
        ? bodyRowSegments[bodyRowIndex]
        : [],
      isHeader: false,
    });
  }
  if (rows.length === 0) return;

  const cellPaddingV = Number(getPath(theme, "components.table_card.table.cell_padding_v", 8));
  const cellPaddingH = Number(getPath(theme, "components.table_card.table.cell_padding_h", 10));
  const borderColor = resolveColor(theme, getPath(theme, "markdown_mapping.table.border_color", "card_border"), "#E7DDCF");
  const borderWeight = Number(getPath(theme, "components.table_card.table.border_weight", 1));
  const minRowHeight = resolveTableMinRowHeight(theme, cellPaddingV);
  const minColumnWidth = Number(getPath(theme, "components.table_card.table.min_column_width", 120));
  const rowGap = Number(getPath(theme, "components.table_card.table.row_gap", 0));
  const columnGap = Number(getPath(theme, "components.table_card.table.column_gap", 0));
  const headerBgColor = resolveColor(theme, getPath(theme, "components.table_card.table.header_bg", "table_header_bg"), null);
  const cardWidth = Number(getPath(theme, "components.card.width", 820));
  const cardPadLeft = Number(getPath(theme, "components.card.padding.left", 20));
  const cardPadRight = Number(getPath(theme, "components.card.padding.right", 20));
  const tableWidth = Math.max(240, cardWidth - cardPadLeft - cardPadRight);
  tableCard.itemSpacing = rowGap;

  function normalizeCellText(raw) {
    return String(raw == null ? "" : raw)
      .replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, "$1")
      .replace(/[*_\`]/g, "")
      .replace(/\\s+/g, " ")
      .trim();
  }

  const contentScores = new Array(columnCount).fill(1);
  for (const row of rows) {
    for (let colIndex = 0; colIndex < columnCount; colIndex += 1) {
      const raw = colIndex < row.cells.length ? row.cells[colIndex] : "";
      const normalized = normalizeCellText(raw);
      const lengthScore = Math.max(1, normalized.length);
      const boostedScore = row.isHeader ? lengthScore * 1.15 : lengthScore;
      contentScores[colIndex] = Math.max(contentScores[colIndex], boostedScore);
    }
  }

  const availableWidth = Math.max(1, tableWidth - columnGap * Math.max(0, columnCount - 1));
  const minWeight = Number(getPath(theme, "components.table_card.table.min_column_weight", 1));
  const maxWeight = Number(getPath(theme, "components.table_card.table.max_column_weight", 3.2));
  const columnWeights = contentScores.map((score) => {
    const baseWeight = Math.sqrt(Math.max(4, score)) / 2;
    return Math.min(maxWeight, Math.max(minWeight, baseWeight));
  });
  const totalWeight = Math.max(1, columnWeights.reduce((sum, value) => sum + value, 0));
  const columnWidths = columnWeights.map((weight) =>
    Math.max(1, Math.floor((availableWidth * weight) / totalWeight))
  );

  // Ensure the full table width is consumed after flooring.
  let widthRemainder =
    availableWidth - columnWidths.reduce((sum, value) => sum + value, 0);
  let remainderIndex = 0;
  while (widthRemainder > 0) {
    const target = remainderIndex % columnWidths.length;
    columnWidths[target] += 1;
    remainderIndex += 1;
    widthRemainder -= 1;
  }

  // Try to keep columns readable without exceeding the table width budget.
  if (minColumnWidth * columnCount <= availableWidth) {
    for (let i = 0; i < columnWidths.length; i += 1) {
      columnWidths[i] = Math.max(minColumnWidth, columnWidths[i]);
    }
    let overflow =
      columnWidths.reduce((sum, value) => sum + value, 0) - availableWidth;
    while (overflow > 0) {
      let widestIndex = 0;
      for (let i = 1; i < columnWidths.length; i += 1) {
        if (columnWidths[i] > columnWidths[widestIndex]) widestIndex = i;
      }
      if (columnWidths[widestIndex] <= minColumnWidth) break;
      columnWidths[widestIndex] -= 1;
      overflow -= 1;
    }
  }

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const rowFrame = createHorizontalFrame(row.isHeader ? "Header Row" : "Body Row");
    rowFrame.primaryAxisSizingMode = "FIXED";
    rowFrame.counterAxisSizingMode = "AUTO";
    rowFrame.resizeWithoutConstraints(tableWidth, 1);
    rowFrame.itemSpacing = columnGap;
    rowFrame.layoutAlign = "STRETCH";
    rowFrame.fills = [];
    tableCard.appendChild(rowFrame);
    const rowCells = [];
    let rowContentHeight = minRowHeight;

    for (let colIndex = 0; colIndex < columnCount; colIndex += 1) {
      const value = colIndex < row.cells.length ? String(row.cells[colIndex] ?? "") : "";
      const cell = createVerticalFrame((row.isHeader ? "Header Cell " : "Cell ") + String(colIndex + 1));
      cell.primaryAxisSizingMode = "AUTO";
      cell.counterAxisSizingMode = "FIXED";
      const cellWidth = Math.max(1, columnWidths[colIndex]);
      cell.resizeWithoutConstraints(cellWidth, 1);
      cell.layoutAlign = "STRETCH";
      cell.clipsContent = false;
      cell.paddingTop = cellPaddingV;
      cell.paddingBottom = cellPaddingV;
      cell.paddingLeft = cellPaddingH;
      cell.paddingRight = cellPaddingH;
      cell.strokes = [solid(borderColor, 1)];
      cell.strokeWeight = borderWeight;
      const cellBg = row.isHeader && headerBgColor ? headerBgColor : "#FFFFFF";
      cell.fills = [solid(cellBg, 1)];
      rowFrame.appendChild(cell);
      rowCells.push(cell);
      const cellSegments =
        Array.isArray(row.segments) && Array.isArray(row.segments[colIndex])
          ? row.segments[colIndex]
          : null;
      const textNode = createText(cell, value, row.isHeader ? "h3" : "body", theme, {
        wrapWidth: Math.max(1, cellWidth - cellPaddingH * 2),
        segments: cellSegments,
      });
      const measuredCellHeight = Math.ceil(Number(textNode.height || 0) + cellPaddingV * 2);
      rowContentHeight = Math.max(rowContentHeight, measuredCellHeight);
    }

    const targetRowHeight = Math.max(
      minRowHeight,
      rowContentHeight,
      Math.ceil(Number(rowFrame.height || 0))
    );
    rowFrame.counterAxisSizingMode = "FIXED";
    rowFrame.resizeWithoutConstraints(tableWidth, targetRowHeight);

    // Force same cell height in a row to avoid ragged table baselines.
    for (const cell of rowCells) {
      cell.primaryAxisSizingMode = "FIXED";
      cell.counterAxisSizingMode = "FIXED";
      cell.layoutAlign = "STRETCH";
      cell.resizeWithoutConstraints(cell.width, targetRowHeight);
    }
  }
}

function renderList(parent, listBlock, theme) {
  const ordered = Boolean(listBlock.ordered);
  const items = Array.isArray(listBlock.items) ? listBlock.items : [];
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const text = typeof item === "string" ? item : String(item?.text ?? "");
    const itemSegments =
      typeof item === "string" || !Array.isArray(item?.segments) ? null : item.segments;
    const prefix = ordered ? String(i + 1) + ". " : "\\u2022 ";
    const mergedSegments = itemSegments
      ? [{ text: prefix, style: "normal" }, ...itemSegments]
      : null;
    createText(parent, prefix + text, "body", theme, { segments: mergedSegments });
  }
}

const model = PAYLOAD.model || {};
const theme = PAYLOAD.theme || {};
const options = PAYLOAD.options || {};
const unsupportedBlocks = [];
const renderedCount = {
  heading: 0,
  paragraph: 0,
  list: 0,
  table: 0,
  code_block: 0,
};

await ensureFonts(theme);

const componentName = String(
  options.componentName || model.componentName || model.title || "Component"
);

let componentSet = null;
if (options.componentSetNodeId) {
  componentSet = await figma.getNodeByIdAsync(options.componentSetNodeId);
}

if (!componentSet) {
  const lookup = componentName.toLowerCase();
  const candidates = figma.currentPage.findAll(
    (node) => node.type === "COMPONENT_SET" && node.name.toLowerCase() === lookup
  );
  componentSet = candidates[0] || null;
}

if (!componentSet) {
  return {
    ok: false,
    error: "Component set not found",
    componentName,
    componentSetNodeId: options.componentSetNodeId || null,
  };
}

const componentSection = findAncestorSection(componentSet);
if (!componentSection) {
  return {
    ok: false,
    error: "Component set has no ancestor SECTION",
    componentSetId: componentSet.id,
  };
}

const page = componentSection.parent;
if (!page || page.type !== "PAGE") {
  return {
    ok: false,
    error: "Component section parent is not a PAGE",
    componentSectionId: componentSection.id,
  };
}

const sectionPattern = String(
  getPath(theme, "layout.target.section_name_pattern", "Doc/{component_name}")
);
const docSectionName = sectionPattern.replace("{component_name}", componentName);
let docSection = null;
for (const child of page.children) {
  if (child.type === "SECTION" && child.name === docSectionName) {
    docSection = child;
    break;
  }
}
if (!docSection) {
  docSection = figma.createSection();
  docSection.name = docSectionName;
  page.appendChild(docSection);
}

const offsetX = Number(
  options.offsetX != null
    ? options.offsetX
    : getPath(theme, "layout.target.position.offset_x", 200)
);
const sectionWidth = Number(getPath(theme, "layout.section.width", 940));
const minSectionHeight = Number(getPath(theme, "layout.section.min_height", 1100));

docSection.name = docSectionName;
docSection.x = componentSection.x + componentSection.width + offsetX;
docSection.y = componentSection.y;
docSection.resizeWithoutConstraints(sectionWidth, minSectionHeight);
clearChildren(docSection);

const canvas = createVerticalFrame("Doc Canvas");
const canvasInset = Number(getPath(theme, "layout.canvas.inset", 40));
const canvasWidth = Number(getPath(theme, "layout.canvas.width", sectionWidth - canvasInset * 2));
const canvasPadding = getPath(theme, "layout.canvas.padding", {});
canvas.resizeWithoutConstraints(canvasWidth, 100);
canvas.paddingTop = Number(canvasPadding.top ?? 28);
canvas.paddingRight = Number(canvasPadding.right ?? 28);
canvas.paddingBottom = Number(canvasPadding.bottom ?? 28);
canvas.paddingLeft = Number(canvasPadding.left ?? 28);
canvas.itemSpacing = Number(getPath(theme, "layout.canvas.item_spacing", 18));
canvas.cornerRadius = Number(getPath(theme, "theme.radii.canvas", 24));
canvas.fills = [solid(resolveColor(theme, "page_bg", "#FFF9F0"), 1)];
canvas.strokes = [solid(resolveColor(theme, "section_border", "#E7DDCF"), 1)];
canvas.strokeWeight = Number(getPath(theme, "theme.strokes.section_border", 1));
canvas.x = canvasInset;
canvas.y = canvasInset;
docSection.appendChild(canvas);

const accentEnabled = getPath(theme, "components.header_block.accent.enabled", false);

let headerTarget;
if (accentEnabled) {
  const accent = createVerticalFrame("Header Accent");
  accent.layoutAlign = "STRETCH";
  const accentPad = getPath(theme, "components.header_block.accent.padding", {});
  accent.paddingTop = Number(accentPad.top ?? 16);
  accent.paddingRight = Number(accentPad.right ?? 24);
  accent.paddingBottom = Number(accentPad.bottom ?? 16);
  accent.paddingLeft = Number(accentPad.left ?? 24);
  accent.itemSpacing = Number(getPath(theme, "components.header_block.item_spacing", 8));
  accent.cornerRadius = Number(getPath(theme, "components.header_block.accent.radius", getPath(theme, "theme.radii.header_accent", 12)));
  const accentColor = resolveColor(theme, getPath(theme, "components.header_block.accent.fills.color", "header_accent"), "#C9E0BE");
  accent.fills = [solid(accentColor, 1)];
  canvas.appendChild(accent);
  headerTarget = accent;
} else {
  const header = createVerticalFrame("Header");
  header.layoutAlign = "STRETCH";
  header.itemSpacing = Number(getPath(theme, "components.header_block.item_spacing", 8));
  canvas.appendChild(header);
  headerTarget = header;
}

const blocks = Array.isArray(model.blocks) ? model.blocks : [];
const titleBlock = blocks.find(
  (block) => block.type === "heading" && Number(block.level) === 1
);
const titleText = String(model.title || titleBlock?.text || componentName);
createText(headerTarget, titleText, "h1", theme, {
  segments: Array.isArray(titleBlock?.segments) ? titleBlock.segments : null,
});

let firstH2Index = blocks.findIndex(
  (block) => block.type === "heading" && Number(block.level) === 2
);
if (firstH2Index < 0) firstH2Index = blocks.length;

for (let index = 0; index < firstH2Index; index += 1) {
  const block = blocks[index];
  if (block.type === "paragraph") {
    createText(headerTarget, String(block.text || ""), "body", theme, {
      colorOverride: "muted_text",
      segments: Array.isArray(block.segments) ? block.segments : null,
    });
    renderedCount.paragraph += 1;
  }
}

const chipsRow = createHorizontalFrame("Meta Chips");
chipsRow.itemSpacing = Number(getPath(theme, "components.chips_row.item_spacing", 8));
chipsRow.layoutAlign = "STRETCH";
canvas.appendChild(chipsRow);

const sectionCount = blocks.filter(
  (block) => block.type === "heading" && Number(block.level) === 2
).length;
const tableCount = blocks.filter((block) => block.type === "table").length;
createChip(chipsRow, String(sectionCount) + " Sections", theme);
createChip(chipsRow, String(tableCount) + " Tables", theme);
createChip(chipsRow, "Markdown Sync", theme);

let currentCard = null;
for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
  const block = blocks[blockIndex];
  if (block.type === "heading" && Number(block.level) === 1) {
    renderedCount.heading += 1;
    continue;
  }

  if (block.type === "heading" && Number(block.level) === 2) {
    currentCard = createCard(
      canvas,
      String(block.text || "Untitled"),
      Array.isArray(block.segments) ? block.segments : null,
      theme
    );
    renderedCount.heading += 1;
    continue;
  }

  if (!currentCard) {
    currentCard = createCard(canvas, "General", null, theme);
  }

  if (block.type === "heading" && Number(block.level) === 3) {
    createText(currentCard, String(block.text || ""), "h3", theme, {
      segments: Array.isArray(block.segments) ? block.segments : null,
    });
    renderedCount.heading += 1;
    continue;
  }

  if (block.type === "paragraph") {
    createText(currentCard, String(block.text || ""), "body", theme, {
      segments: Array.isArray(block.segments) ? block.segments : null,
    });
    renderedCount.paragraph += 1;
    continue;
  }

  if (block.type === "list") {
    renderList(currentCard, block, theme);
    renderedCount.list += 1;
    continue;
  }

  if (block.type === "table") {
    createTable(currentCard, "Table", block, theme);
    renderedCount.table += 1;
    continue;
  }

  if (block.type === "code_block") {
    renderedCount.code_block += 1;
    unsupportedBlocks.push({
      index: blockIndex,
      type: "code_block",
      reason: "Rendered as fallback paragraph",
    });
    createText(currentCard, "[code block omitted in visual render]", "body", theme, {});
    continue;
  }

  unsupportedBlocks.push({
    index: blockIndex,
    type: String(block.type || "unknown"),
    reason: "Rendered as fallback paragraph",
  });
  createText(currentCard, String(block.text || ""), "body", theme, {});
}

const finalHeight = Math.max(minSectionHeight, Number(canvas.height) + canvasInset * 2);
docSection.resizeWithoutConstraints(sectionWidth, finalHeight);

figma.currentPage.selection = [docSection];
figma.viewport.scrollAndZoomIntoView([docSection]);

return {
  ok: true,
  markdownPath: model.markdownPath || null,
  themeName: getPath(theme, "name", "unknown"),
  componentSetId: componentSet.id,
  componentSectionId: componentSection.id,
  targetSectionId: docSection.id,
  targetSectionName: docSection.name,
  offsetXApplied: docSection.x - (componentSection.x + componentSection.width),
  renderedCount,
  unsupportedBlocks,
};
`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const modelPath = args.model;
  const themePath = args.theme;

  if (!modelPath) {
    console.error("Missing --model path to doc_model.json");
    process.exit(1);
  }
  if (!themePath) {
    console.error("Missing --theme path to figma_doc_theme.yml");
    process.exit(1);
  }

  const model = JSON.parse(fs.readFileSync(modelPath, "utf8"));
  const theme = parseYamlDocument(
    fs.readFileSync(themePath, "utf8"),
    `theme file (${themePath})`
  );

  const componentName = args["component-name"] || model.componentName || model.title || "Component";
  const outPath =
    args.out ||
    `${FIGMA_DOC_MODELS_DIR}/${String(componentName).toLowerCase()}.figma-execute.js`;
  const payloadOutPath =
    args["payload-out"] ||
    `${FIGMA_DOC_MODELS_DIR}/${String(componentName).toLowerCase()}.render-payload.json`;
  const offsetX = args["offset-x"] != null ? Number(args["offset-x"]) : undefined;

  const payload = {
    model,
    theme,
    options: {
      componentName,
      componentSetNodeId: args["component-set-id"] || null,
      offsetX,
    },
  };

  const executeCode = buildFigmaExecuteCode(payload);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${executeCode}\n`, "utf8");
  fs.writeFileSync(payloadOutPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        modelPath,
        themePath,
        outPath,
        payloadOutPath,
        componentName,
        componentSetNodeId: payload.options.componentSetNodeId,
        offsetX: payload.options.offsetX,
      },
      null,
      2
    )
  );
}

main();
