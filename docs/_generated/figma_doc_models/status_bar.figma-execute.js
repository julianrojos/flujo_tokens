const PAYLOAD = {"model":{"version":1,"componentName":"StatusBar","markdownPath":"docs/components/status_bar.md","generatedAt":"2026-02-18T02:00:15.467Z","title":"Status Bar","blocks":[{"type":"heading","level":1,"text":"Status Bar"},{"type":"paragraph","text":"The **Status Bar** component represents the top system status row for iPhone layouts."},{"type":"heading","level":2,"text":"Overview"},{"type":"paragraph","text":"In Figma, this component is defined as a `COMPONENT_SET` (`Status-Bar`) with one variant property:"},{"type":"list","ordered":false,"items":[{"text":"`Background`: `Transparent`, `Brand`"}]},{"type":"paragraph","text":"Default variant in Figma: `Background=Transparent`."},{"type":"paragraph","text":"All variants share the same structure and dimensions (`440 x 44`)."},{"type":"paragraph","text":"Source node: [Status-Bar (node `713:202`)](https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=713-202)"},{"type":"heading","level":2,"text":"Anatomy"},{"type":"paragraph","text":"Each status bar contains:"},{"type":"list","ordered":true,"items":[{"index":1,"text":"**Container** (`COMPONENT`, `440 x 44`)"},{"index":2,"text":"**OS row** (`FRAME`, `376 x 18`) positioned at `x=32`, `y=13`"},{"index":3,"text":"**Time group** with text `9:41`"},{"index":4,"text":"**Icons row** (`FRAME`, horizontal) with:"}]},{"type":"list","ordered":false,"items":[{"text":"`Cellular Connection` (`VECTOR`)"},{"text":"`Wifi` (`VECTOR`)"},{"text":"`Battery` (`VECTOR`)"}]},{"type":"heading","level":2,"text":"Component API"},{"type":"heading","level":3,"text":"Properties"},{"type":"table","header":["Name","Type","Default Value","Description"],"rows":[["`Background`","`VARIANT`","`Transparent`","Background style. Options: `Transparent`, `Brand`."]]},{"type":"heading","level":2,"text":"Visual Specifications"},{"type":"heading","level":3,"text":"Container"},{"type":"list","ordered":false,"items":[{"text":"**Variant size**: `440 x 44`"},{"text":"**Layout**: `NONE` (no Auto Layout at root)"},{"text":"**Clips content**: `true`"},{"text":"**Border**: none"},{"text":"**Corner radius**: `0`"}]},{"type":"heading","level":3,"text":"OS Row"},{"type":"list","ordered":false,"items":[{"text":"**Node**: `FRAME`"},{"text":"**Size**: `376 x 18`"},{"text":"**Layout**: Auto Layout, `HORIZONTAL`"},{"text":"**Item spacing**: `229`"},{"text":"**Children**:"},{"text":"Left: time label (`9:41`)"},{"text":"Right: icons frame (`65.98 x 11`, Auto Layout `HORIZONTAL`, spacing `5`)"}]},{"type":"heading","level":3,"text":"Typography"},{"type":"list","ordered":false,"items":[{"text":"**Time text**: `9:41`"},{"text":"**Font**: `Roboto Medium`"},{"text":"**Size**: `15`"},{"text":"**Line height**: `AUTO`"},{"text":"**Letter spacing**: `0%`"}]},{"type":"heading","level":3,"text":"Variants"},{"type":"table","header":["Variant","Background fill","Token","Fallback"],"rows":[["`Background=Transparent`","None","—","Transparent"],["`Background=Brand`","Solid fill","`Color/Background/Brand/Secondary`","`#C9E0BE`"]]},{"type":"heading","level":2,"text":"Tokens Used"},{"type":"table","header":["Slot","Condition","Token","Alias chain","Resolved value"],"rows":[["Background fill","`Background=Brand`","`Color/Background/Brand/Secondary`","`Color/Cucumber/200`","`#C9E0BE`"],["Time text color","All variants","`Color/BW/Black`","—","`#000000`"],["Status icons color","All variants","`Color/BW/Black`","—","`#000000`"]]},{"type":"heading","level":2,"text":"Usage Guidelines"},{"type":"list","ordered":false,"items":[{"text":"Use this component at the top edge of iPhone mockups and flows."},{"text":"Preserve the internal horizontal structure (time on the left, status icons on the right)."},{"text":"Use `Background=Transparent` on light/neutral surfaces where the screen background should remain visible."},{"text":"Use `Background=Brand` when the status bar needs to sit on the brand secondary background."}]},{"type":"heading","level":2,"text":"Accessibility"},{"type":"list","ordered":false,"items":[{"text":"This component is decorative UI chrome in most product contexts."},{"text":"If status information is meaningful in a prototype, provide equivalent text outside this component."},{"text":"No interaction or focus states are defined in Figma for this component."}]},{"type":"heading","level":2,"text":"Gaps / TBD"},{"type":"list","ordered":false,"items":[{"text":"No dark mode or high-contrast variant."},{"text":"No configurable properties for time or signal/battery values."},{"text":"No platform variants beyond the current iPhone layout."}]}],"stats":{"headings":14,"paragraphs":6,"lists":9,"tables":3,"codeBlocks":0}},"theme":{"name":"figma-doc-theme-default","status":"draft","source_component":"Alert","description":"Render contract for converting markdown component docs into Figma documentation sections with consistent visual style.","layout":{"target":{"section_name_pattern":"Doc/{component_name}","position":{"reference":"component_section","offset_x":200,"align_y":"top"}},"section":{"width":940,"min_height":1100},"canvas":{"inset":40,"width":860,"padding":{"top":28,"right":28,"bottom":28,"left":28},"item_spacing":18}},"theme":{"colors":{"page_bg":"#FFF9F0","section_border":"#E7DDCF","card_bg":"#FFFFFF","card_border":"#E7DDCF","title_text":"#3A3030","heading_text":"#3F3434","body_text":"#4E4343","muted_text":"#5B4F4F","chip_bg":"#F6EFE4","chip_border":"#DCCBB2","chip_text":"#6E5A3A"},"radii":{"canvas":24,"card":16,"chip":999},"strokes":{"section_border":1,"card_border":1,"chip_border":1},"spacing":{"card_padding":20,"card_gap":10,"chip_padding_v":6,"chip_padding_h":10,"chip_gap":8,"paragraph_gap":8,"list_gap":6},"typography":{"font_family":"Nunito Sans","h1":{"size":40,"line_height":48,"weight":"Bold","color":"title_text"},"h2":{"size":20,"line_height":28,"weight":"Bold","color":"heading_text"},"h3":{"size":16,"line_height":24,"weight":"SemiBold","color":"heading_text"},"body":{"size":15,"line_height":24,"weight":"Regular","color":"body_text"},"body_small":{"size":13,"line_height":18,"weight":"SemiBold","color":"chip_text"}}},"markdown_mapping":{"document":{"wrapper":"canvas"},"title":{"component":"header_block","text_style":"h1"},"subtitle":{"component":"intro_text","text_style":"body","color_override":"muted_text"},"heading_2":{"component":"card","title_style":"h2"},"heading_3":{"component":"inline_heading","text_style":"h3"},"paragraph":{"component":"text","text_style":"body"},"unordered_list":{"component":"stack","item_gap":"list_gap"},"ordered_list":{"component":"stack","item_gap":"list_gap"},"list_item":{"component":"text","text_style":"body"},"table":{"component":"table_card","header_style":"h3","cell_style":"body","border_color":"card_border"},"code_inline":{"component":"text","text_style":"body","color_override":"heading_text"}},"components":{"header_block":{"layout":"vertical","stretch":true,"item_spacing":6},"chips_row":{"layout":"horizontal","stretch":true,"item_spacing":8},"card":{"layout":"vertical","stretch":true,"width":820,"padding":{"top":20,"right":20,"bottom":20,"left":20},"item_spacing":10,"fills":{"color":"card_bg"},"strokes":{"color":"card_border","weight":1},"radius":16},"table_card":{"extends":"card","table":{"cell_padding_v":8,"cell_padding_h":10,"row_gap":0,"column_gap":0,"border_weight":1}}},"rules":["Keep one visual card per H2 section.","Render markdown in source order; do not reorder content blocks.","Preserve semantic spacing and hierarchy from heading levels.","Avoid hardcoded widths for text nodes; use stretch behavior when possible.","If a markdown element is unsupported, render it as body text and flag it in report."],"output_contract":{"report_fields":["markdown_path","target_section_id","theme_name","offset_x_applied","unsupported_blocks"]}},"options":{"componentName":"StatusBar","componentSetNodeId":"713:202","offsetX":200}};

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

function extractBoldRanges(rawText) {
  const input = String(rawText == null ? "" : rawText);
  const boldRanges = [];
  let plainText = "";
  let cursor = 0;

  while (cursor < input.length) {
    const open = input.indexOf("**", cursor);
    if (open === -1) {
      plainText += input.slice(cursor);
      break;
    }

    const close = input.indexOf("**", open + 2);
    if (close === -1) {
      plainText += input.slice(cursor);
      break;
    }

    plainText += input.slice(cursor, open);
    const boldPart = input.slice(open + 2, close);
    const start = plainText.length;
    plainText += boldPart;
    const end = plainText.length;
    if (end > start) boldRanges.push({ start, end });

    cursor = close + 2;
  }

  return { plainText, boldRanges };
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
  styles.add("Bold");

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
  const parsed = extractBoldRanges(text);
  node.characters = parsed.plainText;
  parent.appendChild(node);
  if (parsed.boldRanges.length > 0) {
    const boldFont = { family, style: "Bold" };
    for (const range of parsed.boldRanges) {
      try {
        node.setRangeFontName(range.start, range.end, boldFont);
      } catch (error) {
        // Ignore unavailable bold style for this font family.
      }
    }
  }
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
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
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
    const prefix = ordered ? String(i + 1) + ". " : "\u2022 ";
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

