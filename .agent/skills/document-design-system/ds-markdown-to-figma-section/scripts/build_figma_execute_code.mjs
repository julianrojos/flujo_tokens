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

function stripInlineComment(rawLine) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < rawLine.length; i += 1) {
    const char = rawLine[i];
    if (char === "'" && !inDouble) inSingle = !inSingle;
    if (char === '"' && !inSingle) inDouble = !inDouble;
    if (char === "#" && !inSingle && !inDouble) {
      if (i === 0 || /\s/.test(rawLine[i - 1])) return rawLine.slice(0, i);
    }
  }
  return rawLine;
}

function parseScalar(rawValue) {
  const value = rawValue.trim();
  if (!value) return "";
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function preprocessYaml(rawYaml) {
  const sourceLines = rawYaml.replace(/\r\n/g, "\n").split("\n");
  const lines = [];
  for (const sourceLine of sourceLines) {
    const uncommented = stripInlineComment(sourceLine);
    if (!uncommented.trim()) continue;
    const indent = uncommented.match(/^ */)?.[0].length ?? 0;
    lines.push({
      indent,
      text: uncommented.trimEnd(),
    });
  }
  return lines;
}

function parseYaml(rawYaml) {
  const lines = preprocessYaml(rawYaml);
  const cursor = { i: 0 };

  function parseFoldedString(baseIndent) {
    const fragments = [];
    while (cursor.i < lines.length) {
      const line = lines[cursor.i];
      if (line.indent <= baseIndent) break;
      fragments.push(line.text.trim());
      cursor.i += 1;
    }
    return fragments.join(" ").trim();
  }

  function parseArray(arrayIndent) {
    const values = [];
    while (cursor.i < lines.length) {
      const line = lines[cursor.i];
      if (line.indent < arrayIndent) break;
      if (line.indent !== arrayIndent || !line.text.trim().startsWith("- ")) break;
      const itemText = line.text.trim().slice(2).trim();
      values.push(parseScalar(itemText));
      cursor.i += 1;
    }
    return values;
  }

  function parseObject(objectIndent) {
    const obj = {};
    while (cursor.i < lines.length) {
      const line = lines[cursor.i];
      if (line.indent < objectIndent) break;
      if (line.indent > objectIndent) {
        throw new Error(
          `Invalid indentation near line: "${line.text}". Expected indent ${objectIndent}, got ${line.indent}.`
        );
      }

      const trimmed = line.text.trim();
      if (trimmed.startsWith("- ")) break;

      const separatorIndex = trimmed.indexOf(":");
      if (separatorIndex === -1) {
        throw new Error(`Invalid YAML line (missing colon): "${trimmed}"`);
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const valueToken = trimmed.slice(separatorIndex + 1).trim();
      cursor.i += 1;

      if (!valueToken) {
        if (cursor.i >= lines.length || lines[cursor.i].indent <= objectIndent) {
          obj[key] = {};
          continue;
        }
        const nextLine = lines[cursor.i];
        if (nextLine.text.trim().startsWith("- ")) {
          obj[key] = parseArray(nextLine.indent);
        } else {
          obj[key] = parseObject(nextLine.indent);
        }
        continue;
      }

      if (valueToken === ">" || valueToken === "|") {
        obj[key] = parseFoldedString(objectIndent);
        continue;
      }

      obj[key] = parseScalar(valueToken);
    }
    return obj;
  }

  return parseObject(0);
}

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

async function ensureFonts(theme) {
  const family = getPath(theme, "theme.typography.font_family", "Nunito Sans");
  const typography = getPath(theme, "theme.typography", {});
  const styles = new Set(["Regular"]);
  for (const [key, value] of Object.entries(typography)) {
    if (key === "font_family") continue;
    if (!value || typeof value !== "object") continue;
    styles.add(fontStyleFromWeight(value.weight));
  }

  for (const style of styles) {
    try {
      await figma.loadFontAsync({ family, style });
    } catch (error) {
      if (style !== "Regular") {
        await figma.loadFontAsync({ family, style: "Regular" });
      } else {
        throw error;
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

  const family = getPath(theme, "theme.typography.font_family", "Nunito Sans");
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
  node.characters = text;
  parent.appendChild(node);
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

function createCard(canvas, title, theme) {
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

  createText(card, title, "h2", theme, {});
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

function createTable(parent, title, tableBlock, theme) {
  const tableCard = createVerticalFrame("Table/" + toSafeName(title || "Table"));
  tableCard.layoutAlign = "STRETCH";
  tableCard.itemSpacing = 6;
  tableCard.fills = [];
  parent.appendChild(tableCard);

  const header = Array.isArray(tableBlock.header) ? tableBlock.header : [];
  const rows = Array.isArray(tableBlock.rows) ? tableBlock.rows : [];
  const columnCount = Math.max(
    header.length,
    ...rows.map((row) => (Array.isArray(row) ? row.length : 0)),
    1
  );

  const cellPaddingV = Number(getPath(theme, "components.table_card.table.cell_padding_v", 8));
  const cellPaddingH = Number(getPath(theme, "components.table_card.table.cell_padding_h", 10));
  const borderColor = resolveColor(theme, getPath(theme, "markdown_mapping.table.border_color", "card_border"), "#E7DDCF");
  const borderWeight = Number(getPath(theme, "components.table_card.table.border_weight", 1));
  const cardWidth = Number(getPath(theme, "components.card.width", 820));
  const cardPadLeft = Number(getPath(theme, "components.card.padding.left", 20));
  const cardPadRight = Number(getPath(theme, "components.card.padding.right", 20));
  const tableWidth = Math.max(240, cardWidth - cardPadLeft - cardPadRight);

  function renderRow(cells, isHeaderRow) {
    const row = createHorizontalFrame(isHeaderRow ? "Header Row" : "Body Row");
    row.primaryAxisSizingMode = "FIXED";
    row.layoutAlign = "STRETCH";
    row.counterAxisSizingMode = "AUTO";
    row.clipsContent = false;
    row.resizeWithoutConstraints(tableWidth, 40);
    row.itemSpacing = 0;
    tableCard.appendChild(row);
    const cellContentWidth = Math.max(1, tableWidth / columnCount - cellPaddingH * 2);

    for (let colIndex = 0; colIndex < columnCount; colIndex += 1) {
      const value = colIndex < cells.length ? String(cells[colIndex] ?? "") : "";
      const cell = createVerticalFrame((isHeaderRow ? "Header Cell " : "Cell ") + String(colIndex + 1));
      cell.primaryAxisSizingMode = "AUTO";
      cell.counterAxisSizingMode = "FIXED";
      cell.layoutGrow = 1;
      cell.clipsContent = false;
      cell.paddingTop = cellPaddingV;
      cell.paddingBottom = cellPaddingV;
      cell.paddingLeft = cellPaddingH;
      cell.paddingRight = cellPaddingH;
      cell.strokes = [solid(borderColor, 1)];
      cell.strokeWeight = borderWeight;
      cell.fills = [solid("#FFFFFF", 1)];
      row.appendChild(cell);
      createText(cell, value, isHeaderRow ? "h3" : "body", theme, {
        wrapWidth: cellContentWidth,
      });
    }
  }

  if (header.length > 0) renderRow(header, true);
  for (const row of rows) {
    const safeRow = Array.isArray(row) ? row : [String(row)];
    renderRow(safeRow, false);
  }
}

function renderList(parent, listBlock, theme) {
  const ordered = Boolean(listBlock.ordered);
  const items = Array.isArray(listBlock.items) ? listBlock.items : [];
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const text = typeof item === "string" ? item : String(item?.text ?? "");
    const prefix = ordered ? String(i + 1) + ". " : "\\u2022 ";
    createText(parent, prefix + text, "body", theme, {});
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

const header = createVerticalFrame("Header");
header.layoutAlign = "STRETCH";
header.itemSpacing = Number(getPath(theme, "components.header_block.item_spacing", 6));
canvas.appendChild(header);

const titleText = String(model.title || componentName);
createText(header, titleText, "h1", theme, {});

const blocks = Array.isArray(model.blocks) ? model.blocks : [];
let firstH2Index = blocks.findIndex(
  (block) => block.type === "heading" && Number(block.level) === 2
);
if (firstH2Index < 0) firstH2Index = blocks.length;

for (let index = 0; index < firstH2Index; index += 1) {
  const block = blocks[index];
  if (block.type === "paragraph") {
    createText(header, String(block.text || ""), "body", theme, {
      colorOverride: "muted_text",
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
    currentCard = createCard(canvas, String(block.text || "Untitled"), theme);
    renderedCount.heading += 1;
    continue;
  }

  if (!currentCard) {
    currentCard = createCard(canvas, "General", theme);
  }

  if (block.type === "heading" && Number(block.level) === 3) {
    createText(currentCard, String(block.text || ""), "h3", theme, {});
    renderedCount.heading += 1;
    continue;
  }

  if (block.type === "paragraph") {
    createText(currentCard, String(block.text || ""), "body", theme, {});
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
  const theme = parseYaml(fs.readFileSync(themePath, "utf8"));

  const componentName = args["component-name"] || model.componentName || model.title || "Component";
  const outPath =
    args.out ||
    `docs/_generated/figma_doc_models/${String(componentName).toLowerCase()}.figma-execute.js`;
  const payloadOutPath =
    args["payload-out"] ||
    `docs/_generated/figma_doc_models/${String(componentName).toLowerCase()}.render-payload.json`;
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
