const PAYLOAD = {"model":{"version":1,"componentName":"StatusBar","markdownPath":"docs/components/status_bar.md","title":"Status Bar","blocks":[{"type":"heading","level":1,"text":"Status Bar"},{"type":"paragraph","text":"The **Status Bar** component represents the top system status row for iPhone layouts."},{"type":"heading","level":2,"text":"Overview"},{"type":"paragraph","text":"In Figma, this component is defined as a `COMPONENT_SET` (`Status-Bar`) with one variant property:"},{"type":"list","ordered":false,"items":[{"text":"`Background`: `Transparent`, `Brand`"}]},{"type":"paragraph","text":"Default variant in Figma: `Background=Transparent`."},{"type":"paragraph","text":"All variants share the same structure and dimensions (`440 x 44`)."},{"type":"paragraph","text":"Source: [Status-Bar in Figma](https://www.figma.com/design/3hGC1ju0d5AKzaoI9pKIyu/PFB---Design-System?node-id=713-202)"},{"type":"heading","level":2,"text":"Anatomy"},{"type":"paragraph","text":"Each status bar contains:"},{"type":"list","ordered":true,"items":[{"index":1,"text":"**Container** (`COMPONENT`, `440 x 44`)"},{"index":2,"text":"**OS row** (`FRAME`, `376 x 18`) positioned at `x=32`, `y=13`"},{"index":3,"text":"**Time group** with text `9:41`"},{"index":4,"text":"**Icons row** (`FRAME`, horizontal) with:"}]},{"type":"list","ordered":false,"items":[{"text":"`Cellular Connection` (`VECTOR`)"},{"text":"`Wifi` (`VECTOR`)"},{"text":"`Battery` (`VECTOR`)"}]},{"type":"heading","level":2,"text":"Component API"},{"type":"heading","level":3,"text":"Properties"},{"type":"table","header":["Name","Type","Default","Required","Description"],"rows":[["`Background`","`VARIANT`","`Transparent`","`true`","Background style. Options: `Transparent`, `Brand`."]]},{"type":"heading","level":2,"text":"Visual Specifications"},{"type":"heading","level":3,"text":"Container"},{"type":"list","ordered":false,"items":[{"text":"**Variant size**: `440 x 44`"},{"text":"**Layout**: `NONE` (no Auto Layout at root)"},{"text":"**Clips content**: `true`"},{"text":"**Border**: none"},{"text":"**Corner radius**: `0`"}]},{"type":"heading","level":3,"text":"OS Row"},{"type":"list","ordered":false,"items":[{"text":"**Node**: `FRAME`"},{"text":"**Size**: `376 x 18`"},{"text":"**Layout**: Auto Layout, `HORIZONTAL`"},{"text":"**Item spacing**: `229`"},{"text":"**Children**:"},{"text":"Left: time label (`9:41`)"},{"text":"Right: icons frame (`65.98 x 11`, Auto Layout `HORIZONTAL`, spacing `5`)"}]},{"type":"heading","level":3,"text":"Typography"},{"type":"list","ordered":false,"items":[{"text":"**Time text**: `9:41`"},{"text":"**Font**: `Roboto Medium`"},{"text":"**Size**: `15`"},{"text":"**Line height**: `AUTO`"},{"text":"**Letter spacing**: `0%`"}]},{"type":"heading","level":3,"text":"Iconography"},{"type":"list","ordered":false,"items":[{"text":"**Icons**: `Cellular Connection`, `Wifi`, `Battery`"},{"text":"**Icons color token**: `Color/BW/Black`"},{"text":"**Icons fallback**: `#000000`"}]},{"type":"heading","level":3,"text":"Token Mapping"},{"type":"table","header":["Part","Condition","Token","Fallback"],"rows":[["`container.background`","`Background=Brand`","`Color/Background/Brand/Secondary`","`#C9E0BE`"],["`time.color`","all variants","`Color/BW/Black`","`#000000`"],["`icons.color`","all variants","`Color/BW/Black`","`#000000`"]]},{"type":"heading","level":2,"text":"Variants"},{"type":"table","header":["Variant","Differentiating token(s)","Fallback value(s)","Visual indicator"],"rows":[["`Background=Transparent`","`—`","`Transparent`","No background fill"],["`Background=Brand`","`Color/Background/Brand/Secondary`","`#C9E0BE`","Brand secondary surface fill"]]},{"type":"heading","level":2,"text":"States"},{"type":"paragraph","text":"This component has no interactive states."},{"type":"heading","level":2,"text":"Usage Guidelines"},{"type":"list","ordered":false,"items":[{"text":"**When to use**: Use at the top edge of iPhone-oriented mockups and mobile layout compositions."},{"text":"**When not to use**: Do not use as an interactive toolbar or as a content container."},{"text":"**Do**: Keep internal layout structure unchanged (time left, icons right)."},{"text":"**Do**: Use `Background=Transparent` or `Background=Brand` according to the parent surface."},{"text":"**Don't**: Override icon/time color without validating contrast."},{"text":"**Don't**: Treat this component as a replacement for app-level navigation."}]},{"type":"heading","level":2,"text":"Content Guidelines"},{"type":"paragraph","text":"This component has no user-authored text content. Time/system indicators are system-driven."},{"type":"heading","level":2,"text":"Accessibility"},{"type":"heading","level":3,"text":"1. ARIA role and semantics"},{"type":"list","ordered":false,"items":[{"text":"In most documentation/prototype contexts, this component is decorative system chrome."},{"text":"If rendered in product UI, semantic treatment is `TBD` and should follow platform conventions."},{"text":"Required ARIA attributes are `TBD`."}]},{"type":"heading","level":3,"text":"2. Keyboard navigation"},{"type":"paragraph","text":"This component is not keyboard-interactive."},{"type":"heading","level":3,"text":"3. Focus management"},{"type":"list","ordered":false,"items":[{"text":"No focus behavior is defined in Figma."},{"text":"Focus outline tokens are not applicable unless this component becomes interactive (`TBD`)."}]},{"type":"heading","level":3,"text":"4. Labeling"},{"type":"list","ordered":false,"items":[{"text":"If status data is meaningful for assistive tech, provide equivalent accessible text outside this visual component."},{"text":"Labeling strategy for implementation is `TBD`."}]},{"type":"heading","level":3,"text":"5. Contrast and visibility"},{"type":"list","ordered":false,"items":[{"text":"Time and icon foreground should remain visible against both transparent and brand backgrounds."},{"text":"Contrast verification is `TBD (pending audit)`."}]},{"type":"heading","level":2,"text":"Related Components"},{"type":"list","ordered":false,"items":[{"text":"[Bottom Bar](bottom_bar.md): Use as complementary bottom navigation in mobile page chrome."},{"text":"[Alert](alert.md): Use for contextual feedback content, not for fixed device chrome."}]},{"type":"heading","level":2,"text":"Gaps / TBD"},{"type":"list","ordered":false,"items":[{"text":"No dark mode or high-contrast variant."},{"text":"No configurable properties for time or signal/battery values."},{"text":"No platform variants beyond the current iPhone layout."}]}],"stats":{"headings":23,"paragraphs":9,"lists":14,"tables":3,"codeBlocks":0}},"theme":{"name":"figma-doc-theme-karmap","status":"ready","description":"Render contract for converting markdown component docs into Figma documentation sections. Styled to match the Karmap / Iter design system visual identity: Lora headings, Nunito Sans body, cucumber-green accents on warm cream surfaces.","layout":{"target":{"section_name_pattern":"Doc/{component_name}","position":{"reference":"component_section","offset_x":200,"align_y":"top"}},"section":{"width":940,"min_height":1100},"canvas":{"inset":40,"width":860,"padding":{"top":32,"right":32,"bottom":32,"left":32},"item_spacing":20}},"theme":{"colors":{"page_bg":"#FFFAF0","section_border":"#C9E0BE","canvas_shadow":"#00000014","card_bg":"#FFFFFF","card_border":"#E7DDCF","table_header_bg":"#F5F0E6","title_text":"#495841","heading_text":"#495841","body_text":"#483F3F","muted_text":"#716666","chip_bg":"#E8F0E4","chip_border":"#C9E0BE","chip_text":"#495841","header_accent":"#C9E0BE"},"radii":{"canvas":20,"card":12,"chip":999,"header_accent":12},"strokes":{"section_border":1.5,"card_border":1,"chip_border":1},"spacing":{"card_padding":20,"card_gap":12,"chip_padding_v":5,"chip_padding_h":12,"chip_gap":8,"paragraph_gap":8,"list_gap":6,"header_accent_padding_v":16,"header_accent_padding_h":24},"typography":{"font_family":"Nunito Sans","font_family_heading":"Lora","h1":{"font_family":"Lora","size":36,"line_height":42,"weight":"Bold","color":"title_text"},"h2":{"font_family":"Lora","size":20,"line_height":26,"weight":"Bold","color":"heading_text"},"h3":{"size":16,"line_height":24,"weight":"SemiBold","color":"heading_text"},"body":{"size":15,"line_height":24,"weight":"Regular","color":"body_text"},"body_small":{"size":13,"line_height":18,"weight":"SemiBold","color":"chip_text"}}},"markdown_mapping":{"document":{"wrapper":"canvas"},"title":{"component":"header_block","text_style":"h1"},"subtitle":{"component":"intro_text","text_style":"body","color_override":"muted_text"},"heading_2":{"component":"card","title_style":"h2"},"heading_3":{"component":"inline_heading","text_style":"h3"},"paragraph":{"component":"text","text_style":"body"},"unordered_list":{"component":"stack","item_gap":"list_gap"},"ordered_list":{"component":"stack","item_gap":"list_gap"},"list_item":{"component":"text","text_style":"body"},"table":{"component":"table_card","header_style":"h3","cell_style":"body","border_color":"card_border","header_bg":"table_header_bg"},"code_inline":{"component":"text","text_style":"body","color_override":"heading_text"}},"components":{"header_block":{"layout":"vertical","stretch":true,"item_spacing":8,"accent":{"enabled":true,"fills":{"color":"header_accent"},"radius":12,"padding":{"top":16,"right":24,"bottom":16,"left":24}}},"chips_row":{"layout":"horizontal","stretch":true,"item_spacing":8},"card":{"layout":"vertical","stretch":true,"width":796,"padding":{"top":20,"right":20,"bottom":20,"left":20},"item_spacing":12,"fills":{"color":"card_bg"},"strokes":{"color":"card_border","weight":1},"radius":12},"table_card":{"extends":"card","table":{"cell_padding_v":8,"cell_padding_h":10,"row_gap":0,"column_gap":0,"border_weight":1,"header_bg":"table_header_bg"}}},"rules":["Keep one visual card per H2 section.","Render markdown in source order; do not reorder content blocks.","Preserve semantic spacing and hierarchy from heading levels.","Avoid hardcoded widths for text nodes; use stretch behavior when possible.","If a markdown element is unsupported, render it as body text and flag it in report.","Use Lora for h1 and h2 headings; Nunito Sans for everything else.","Table header rows use a tinted background to distinguish from body rows.","The header accent block wraps the title area with a brand-colored background."],"output_contract":{"report_fields":["markdown_path","target_section_id","theme_name","offset_x_applied","unsupported_blocks"]}},"options":{"componentName":"StatusBar","componentSetNodeId":"713:202","offsetX":200}};

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
  const bodyFamily = getPath(theme, "theme.typography.font_family", "Nunito Sans");
  const headingFamily = getPath(theme, "theme.typography.font_family_heading", bodyFamily);
  const typography = getPath(theme, "theme.typography", {});

  // Collect { family, style } pairs from all typography entries
  const fontPairs = new Set();
  fontPairs.add(bodyFamily + ":Regular");
  fontPairs.add(bodyFamily + ":Bold");
  if (headingFamily !== bodyFamily) {
    fontPairs.add(headingFamily + ":Regular");
    fontPairs.add(headingFamily + ":Bold");
  }
  for (const [key, value] of Object.entries(typography)) {
    if (key === "font_family" || key === "font_family_heading") continue;
    if (!value || typeof value !== "object") continue;
    const fam = value.font_family || bodyFamily;
    fontPairs.add(fam + ":" + fontStyleFromWeight(value.weight));
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
  const parsed = extractBoldRanges(text);
  node.characters = parsed.plainText;
  parent.appendChild(node);
  if (parsed.boldRanges.length > 0) {
    const boldFont = { family: family, style: "Bold" };
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
  tableCard.itemSpacing = 0;
  tableCard.fills = [];
  parent.appendChild(tableCard);

  const header = Array.isArray(tableBlock.header) ? tableBlock.header : [];
  const bodyRows = Array.isArray(tableBlock.rows) ? tableBlock.rows : [];
  const columnCount = Math.max(
    header.length,
    ...bodyRows.map((row) => (Array.isArray(row) ? row.length : 0)),
    1
  );
  const rows = [];
  if (header.length > 0) rows.push({ cells: header, isHeader: true });
  for (const row of bodyRows) {
    const safeRow = Array.isArray(row) ? row : [String(row)];
    rows.push({ cells: safeRow, isHeader: false });
  }
  if (rows.length === 0) return;

  const cellPaddingV = Number(getPath(theme, "components.table_card.table.cell_padding_v", 8));
  const cellPaddingH = Number(getPath(theme, "components.table_card.table.cell_padding_h", 10));
  const borderColor = resolveColor(theme, getPath(theme, "markdown_mapping.table.border_color", "card_border"), "#E7DDCF");
  const borderWeight = Number(getPath(theme, "components.table_card.table.border_weight", 1));
  const minRowHeight = Number(getPath(theme, "components.table_card.table.min_row_height", 40));
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
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
      .replace(/[*_`]/g, "")
      .replace(/\s+/g, " ")
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
      createText(cell, value, row.isHeader ? "h3" : "body", theme, {
        wrapWidth: Math.max(1, cellWidth - cellPaddingH * 2),
      });
    }

    const targetRowHeight = Math.max(minRowHeight, Math.ceil(rowFrame.height));
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

const titleText = String(model.title || componentName);
createText(headerTarget, titleText, "h1", theme, {});

const blocks = Array.isArray(model.blocks) ? model.blocks : [];
let firstH2Index = blocks.findIndex(
  (block) => block.type === "heading" && Number(block.level) === 2
);
if (firstH2Index < 0) firstH2Index = blocks.length;

for (let index = 0; index < firstH2Index; index += 1) {
  const block = blocks[index];
  if (block.type === "paragraph") {
    createText(headerTarget, String(block.text || ""), "body", theme, {
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

