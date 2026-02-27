#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { parseYamlDocument } from "../../../../../tooling/scripts/lib/parse-frontmatter.mjs";
import { parseArgs } from "../../../../../tooling/scripts/lib/parse-args.mjs";
import { FIGMA_DOC_MODELS_DIR } from "../../../../../tooling/scripts/lib/paths.mjs";
import {
  DEFAULT_TOKEN_REGISTRY_PATH,
  loadTokenRegistry,
} from "../../../../../tooling/scripts/lib/token-registry.mjs";

function normalizeHexColor(rawValue) {
  if (typeof rawValue !== "string") return null;
  const trimmed = rawValue.trim();
  if (!trimmed.startsWith("#")) return null;
  const hex = trimmed.slice(1);
  if (![3, 4, 6, 8].includes(hex.length)) return null;
  if (!/^[0-9a-f]+$/i.test(hex)) return null;
  return `#${hex.toLowerCase()}`;
}

function getVarReference(rawValue) {
  if (typeof rawValue !== "string") return null;
  const match = rawValue
    .trim()
    .match(/^var\(\s*(--[a-z0-9\-_]+)\s*(?:,\s*[^)]+)?\)$/i);
  return match ? match[1] : null;
}

function asTokenKey(rawKey) {
  if (typeof rawKey !== "string") return "";
  return rawKey.trim().replace(/^["'`]+|["'`]+$/g, "");
}

function addTokenAlias(colorIndex, rawKey, hexValue) {
  const key = asTokenKey(rawKey).toLowerCase();
  if (!key) return;
  if (colorIndex[key] === undefined) colorIndex[key] = hexValue;
}

function addTokenNumberAlias(numberIndex, rawKey, numericValue) {
  const key = asTokenKey(rawKey).toLowerCase();
  if (!key) return;
  if (numberIndex[key] === undefined) numberIndex[key] = numericValue;
}

function extractUniqueEntries(registryIndex) {
  const unique = [];
  const seen = new Set();
  for (const entry of Object.values(registryIndex || {})) {
    if (!entry || typeof entry !== "object") continue;
    const marker = [
      entry.path ?? "",
      entry.slashPath ?? "",
      entry.cssVar ?? "",
      entry.collection ?? "",
    ].join("|");
    if (seen.has(marker)) continue;
    seen.add(marker);
    unique.push(entry);
  }
  return unique;
}

function resolveEntryHex(entry, byCssVar, cache, stack = new Set()) {
  const cacheKey = String(entry.path || entry.slashPath || entry.cssVar || "");
  if (cache[cacheKey] !== undefined) return cache[cacheKey];
  if (stack.has(cacheKey)) return null;

  stack.add(cacheKey);
  const directHex = normalizeHexColor(entry.resolvedValue);
  if (directHex) {
    cache[cacheKey] = directHex;
    stack.delete(cacheKey);
    return directHex;
  }

  const varRef = getVarReference(entry.resolvedValue);
  if (!varRef) {
    cache[cacheKey] = null;
    stack.delete(cacheKey);
    return null;
  }

  const referencedEntry = byCssVar.get(varRef);
  if (!referencedEntry) {
    cache[cacheKey] = null;
    stack.delete(cacheKey);
    return null;
  }

  const resolved = resolveEntryHex(referencedEntry, byCssVar, cache, stack);
  cache[cacheKey] = resolved;
  stack.delete(cacheKey);
  return resolved;
}

function parseDimensionNumber(rawValue) {
  if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
    return rawValue;
  }
  if (typeof rawValue !== "string") return null;
  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  const pxMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)px$/i);
  if (pxMatch) {
    const parsed = Number(pxMatch[1]);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const numericMatch = trimmed.match(/^-?\d+(?:\.\d+)?$/);
  if (numericMatch) {
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function resolveEntryDimension(entry, byCssVar, cache, stack = new Set()) {
  const cacheKey = String(entry.path || entry.slashPath || entry.cssVar || "");
  if (cache[cacheKey] !== undefined) return cache[cacheKey];
  if (stack.has(cacheKey)) return null;

  stack.add(cacheKey);
  const directNumber = parseDimensionNumber(entry.resolvedValue);
  if (directNumber != null) {
    cache[cacheKey] = directNumber;
    stack.delete(cacheKey);
    return directNumber;
  }

  const varRef = getVarReference(entry.resolvedValue);
  if (!varRef) {
    cache[cacheKey] = null;
    stack.delete(cacheKey);
    return null;
  }

  const referencedEntry = byCssVar.get(varRef);
  if (!referencedEntry) {
    cache[cacheKey] = null;
    stack.delete(cacheKey);
    return null;
  }

  const resolved = resolveEntryDimension(
    referencedEntry,
    byCssVar,
    cache,
    stack,
  );
  cache[cacheKey] = resolved;
  stack.delete(cacheKey);
  return resolved;
}

function buildColorTokenIndex(registryIndex) {
  const entries = extractUniqueEntries(registryIndex);
  const byCssVar = new Map();
  for (const entry of entries) {
    if (typeof entry.cssVar === "string" && entry.cssVar.trim()) {
      byCssVar.set(entry.cssVar.trim(), entry);
    }
  }

  const colorIndex = Object.create(null);
  const cache = Object.create(null);

  for (const entry of entries) {
    if (String(entry.type || "").toLowerCase() !== "color") continue;

    const resolvedHex = resolveEntryHex(entry, byCssVar, cache);
    if (!resolvedHex) continue;

    const dotPath = asTokenKey(entry.path);
    const slashPath = asTokenKey(entry.slashPath);
    const collection = String(entry.collection || "")
      .trim()
      .toLowerCase();

    addTokenAlias(colorIndex, dotPath, resolvedHex);
    addTokenAlias(colorIndex, slashPath, resolvedHex);

    if (dotPath.includes(".")) {
      addTokenAlias(
        colorIndex,
        dotPath.split(".").slice(1).join("."),
        resolvedHex,
      );
    }

    if (collection && slashPath) {
      addTokenAlias(colorIndex, `${collection}/${slashPath}`, resolvedHex);
      addTokenAlias(colorIndex, `_${collection}/${slashPath}`, resolvedHex);
    }

    // Compatibility alias for legacy shorthand (for example `_primitives/BW/White`).
    if (collection === "primitives" && slashPath.startsWith("Color/")) {
      const primitiveShortPath = slashPath.slice("Color/".length);
      addTokenAlias(
        colorIndex,
        `primitives/${primitiveShortPath}`,
        resolvedHex,
      );
      addTokenAlias(
        colorIndex,
        `_primitives/${primitiveShortPath}`,
        resolvedHex,
      );
    }
  }

  return colorIndex;
}

function buildDimensionTokenIndex(registryIndex) {
  const entries = extractUniqueEntries(registryIndex);
  const byCssVar = new Map();
  for (const entry of entries) {
    if (typeof entry.cssVar === "string" && entry.cssVar.trim()) {
      byCssVar.set(entry.cssVar.trim(), entry);
    }
  }

  const dimensionIndex = Object.create(null);
  const cache = Object.create(null);

  for (const entry of entries) {
    if (String(entry.type || "").toLowerCase() !== "dimension") continue;

    const resolvedNumber = resolveEntryDimension(entry, byCssVar, cache);
    if (resolvedNumber == null) continue;

    const dotPath = asTokenKey(entry.path);
    const slashPath = asTokenKey(entry.slashPath);
    const collection = String(entry.collection || "")
      .trim()
      .toLowerCase();

    addTokenNumberAlias(dimensionIndex, dotPath, resolvedNumber);
    addTokenNumberAlias(dimensionIndex, slashPath, resolvedNumber);

    if (dotPath.includes(".")) {
      addTokenNumberAlias(
        dimensionIndex,
        dotPath.split(".").slice(1).join("."),
        resolvedNumber,
      );
    }

    if (collection && slashPath) {
      addTokenNumberAlias(
        dimensionIndex,
        `${collection}/${slashPath}`,
        resolvedNumber,
      );
      addTokenNumberAlias(
        dimensionIndex,
        `_${collection}/${slashPath}`,
        resolvedNumber,
      );
    }
  }

  return dimensionIndex;
}

function loadTokenIndexes(registryPath) {
  const absolutePath = path.resolve(registryPath);
  if (!fs.existsSync(absolutePath)) {
    return {
      tokenColors: Object.create(null),
      tokenDimensions: Object.create(null),
    };
  }

  try {
    const registryIndex = loadTokenRegistry(absolutePath);
    return {
      tokenColors: buildColorTokenIndex(registryIndex),
      tokenDimensions: buildDimensionTokenIndex(registryIndex),
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(
      `[build_figma_execute_code] Token registry ignored (${reason})`,
    );
    return {
      tokenColors: Object.create(null),
      tokenDimensions: Object.create(null),
    };
  }
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
  if (typeof hex !== "string") return { r: 0, g: 0, b: 0, a: 1 };
  const cleaned = hex.trim().replace("#", "");
  if (!cleaned) return { r: 0, g: 0, b: 0, a: 1 };
  const expanded = (() => {
    if (cleaned.length === 3 || cleaned.length === 4) {
      return cleaned
        .split("")
        .map((c) => c + c)
        .join("");
    }
    if (cleaned.length === 6 || cleaned.length === 8) {
      return cleaned;
    }
    if (cleaned.length > 8) return cleaned.slice(0, 8);
    return cleaned.padEnd(6, "0");
  })();

  const colorHex = expanded.slice(0, 6).padEnd(6, "0");
  const alphaHex =
    expanded.length >= 8 ? expanded.slice(6, 8) : null;
  const alphaRaw = alphaHex ? Number.parseInt(alphaHex, 16) : 255;
  const alpha =
    Number.isFinite(alphaRaw) && alphaRaw >= 0 ? Math.max(0, Math.min(255, alphaRaw)) / 255 : 1;
  const value = Number.parseInt(colorHex, 16);
  return {
    r: ((value >> 16) & 255) / 255,
    g: ((value >> 8) & 255) / 255,
    b: (value & 255) / 255,
    a: alpha,
  };
}

function solid(hex, opacity) {
  const rgb = hexToRgb(hex);
  const baseOpacity = Number.isFinite(rgb.a) ? rgb.a : 1;
  const requestedOpacity = Number.isFinite(opacity) ? opacity : null;
  const finalOpacity = requestedOpacity == null ? baseOpacity : requestedOpacity * baseOpacity;
  return {
    type: "SOLID",
    color: {
      r: rgb.r,
      g: rgb.g,
      b: rgb.b,
    },
    opacity: Math.max(0, Math.min(1, finalOpacity)),
  };
}

function normalizeTokenKey(rawValue) {
  if (typeof rawValue !== "string") return "";
  return rawValue.trim().replace(/^["'\`]+|["'\`]+$/g, "");
}

function resolveColorFromRegistry(tokenColors, rawToken) {
  if (!tokenColors || typeof tokenColors !== "object") return null;
  const tokenKey = normalizeTokenKey(rawToken);
  if (!tokenKey) return null;
  return tokenColors[tokenKey] || tokenColors[tokenKey.toLowerCase()] || null;
}

function resolveColor(theme, tokenColors, colorOrToken, fallbackHex) {
  if (typeof colorOrToken === "string" && colorOrToken.startsWith("#")) {
    return colorOrToken;
  }
  if (typeof colorOrToken === "string") {
    const tokenValue = getPath(theme, "theme.colors." + colorOrToken, null);
    if (typeof tokenValue === "string" && tokenValue.startsWith("#")) return tokenValue;
    const themeRegistryValue = resolveColorFromRegistry(tokenColors, tokenValue);
    if (typeof themeRegistryValue === "string" && themeRegistryValue.startsWith("#")) {
      return themeRegistryValue;
    }
    const directRegistryValue = resolveColorFromRegistry(tokenColors, colorOrToken);
    if (typeof directRegistryValue === "string" && directRegistryValue.startsWith("#")) {
      return directRegistryValue;
    }
  }
  return fallbackHex;
}

function parseNumericDimension(rawValue) {
  if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
    return rawValue;
  }
  if (typeof rawValue !== "string") return null;
  const trimmed = rawValue.trim();
  if (!trimmed) return null;
  const pxMatch = trimmed.match(/^(-?\\d+(?:\\.\\d+)?)px$/i);
  if (pxMatch) {
    const parsedPx = Number(pxMatch[1]);
    return Number.isFinite(parsedPx) ? parsedPx : null;
  }
  const numericMatch = trimmed.match(/^-?\\d+(?:\\.\\d+)?$/);
  if (numericMatch) {
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function resolveDimensionFromRegistry(tokenDimensions, rawToken) {
  if (!tokenDimensions || typeof tokenDimensions !== "object") return null;
  const tokenKey = normalizeTokenKey(rawToken);
  if (!tokenKey) return null;
  const value = tokenDimensions[tokenKey] || tokenDimensions[tokenKey.toLowerCase()] || null;
  return Number.isFinite(value) ? value : null;
}

function resolveRadiusValue(theme, tokenDimensions, valueOrToken, fallbackValue) {
  const directValue = parseNumericDimension(valueOrToken);
  if (directValue != null) return directValue;

  const aliasValue =
    typeof valueOrToken === "string"
      ? getPath(theme, "theme.radii." + valueOrToken, null)
      : null;
  const aliasNumericValue = parseNumericDimension(aliasValue);
  if (aliasNumericValue != null) return aliasNumericValue;

  const registryAliasValue = resolveDimensionFromRegistry(tokenDimensions, aliasValue);
  if (registryAliasValue != null) return registryAliasValue;

  const registryDirectValue = resolveDimensionFromRegistry(tokenDimensions, valueOrToken);
  if (registryDirectValue != null) return registryDirectValue;

  const fallbackNumericValue = parseNumericDimension(fallbackValue);
  if (fallbackNumericValue != null) return fallbackNumericValue;
  const numericFallback = Number(fallbackValue);
  return Number.isFinite(numericFallback) ? numericFallback : 0;
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
  const colorHex = resolveColor(theme, tokenColors, colorToken, "#4E4343");

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

function findRootPage(node) {
  let current = node;
  while (current) {
    if (current.type === "PAGE") return current;
    current = current.parent;
  }
  return null;
}

function resolveGlobalXY(node) {
  let x = 0;
  let y = 0;
  let current = node;
  let depth = 0;
  const MAX_DEPTH = 64;

  while (current && depth < MAX_DEPTH) {
    x += Number(current.x || 0);
    y += Number(current.y || 0);
    if (current.type === "PAGE") break;
    current = current.parent;
    depth += 1;
  }

  return { x, y };
}

function getAbsoluteBounds(node) {
  if (!node) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const width = Number(node.width || 0);
  const height = Number(node.height || 0);
  const transform = node.absoluteTransform;

  if (
    Array.isArray(transform) &&
    transform.length >= 2 &&
    Array.isArray(transform[0]) &&
    Array.isArray(transform[1])
  ) {
    const x = Number(transform[0][2] || 0);
    const y = Number(transform[1][2] || 0);
    return { x, y, width, height };
  }

  const global = resolveGlobalXY(node);
  return {
    x: global.x,
    y: global.y,
    width,
    height,
  };
}

function resolvePageForSection(componentSection, componentSet) {
  if (
    componentSection &&
    componentSection.parent &&
    componentSection.parent.type === "PAGE"
  ) {
    return componentSection.parent;
  }

  const fromSection = findRootPage(componentSection);
  if (fromSection) return fromSection;

  const fromComponent = findRootPage(componentSet);
  if (fromComponent) return fromComponent;

  return figma.currentPage || null;
}

function findSectionByName(rootNode, sectionName) {
  if (!rootNode || !sectionName) return null;
  const queue = [rootNode];

  while (queue.length > 0) {
    const node = queue.shift();
    if (!node) continue;
    if (node.type === "SECTION" && node.name === sectionName) {
      return node;
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) queue.push(child);
    }
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
  card.cornerRadius = resolveRadiusValue(
    theme,
    tokenDimensions,
    getPath(theme, "components.card.radius", getPath(theme, "theme.radii.card", 16)),
    16
  );
  card.fills = [solid(resolveColor(theme, tokenColors, getPath(theme, "components.card.fills.color", "card_bg"), "#FFFFFF"), 1)];
  card.strokes = [solid(resolveColor(theme, tokenColors, getPath(theme, "components.card.strokes.color", "card_border"), "#E7DDCF"), 1)];
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
  chip.cornerRadius = resolveRadiusValue(
    theme,
    tokenDimensions,
    getPath(theme, "theme.radii.chip", 999),
    999
  );
  chip.strokes = [solid(resolveColor(theme, tokenColors, "chip_border", "#DCCBB2"), 1)];
  chip.strokeWeight = Number(getPath(theme, "theme.strokes.chip_border", 1));
  chip.fills = [solid(resolveColor(theme, tokenColors, "chip_bg", "#F6EFE4"), 1)];
  parent.appendChild(chip);
  createText(chip, label, "body_small", theme, {
    colorOverride: "chip_text",
    wrap: false,
  });
}

function createCodeBlock(parent, codeBlock, theme) {
  // Helper to apply consistent styling to code block frames
  function applyCodeBlockStyle(frame, { isPlaceholder = false } = {}) {
    const bgColor = resolveColor(theme, tokenColors, "code_bg", "#F5F5F5");
    const borderColor = isPlaceholder 
      ? resolveColor(theme, tokenColors, "code_text", "#2D2D2D") 
      : resolveColor(theme, tokenColors, "code_border", "#E0E0E0");
    
    frame.fills = [solid(bgColor, 1)];
    frame.strokes = [solid(borderColor, isPlaceholder ? 0.3 : 1)];
    frame.strokeWeight = Number(getPath(theme, "components.code_block.stroke_weight", 1));
    frame.cornerRadius = resolveRadiusValue(
      theme,
      tokenDimensions,
      getPath(theme, "components.code_block.border_radius", 6),
      6
    );
    const padding = Number(getPath(theme, "components.code_block.padding", 12));
    frame.paddingTop = padding;
    frame.paddingRight = padding;
    frame.paddingBottom = padding;
    frame.paddingLeft = padding;
  }

  const codeText = String(codeBlock.text || "");
  if (!codeText.trim()) {
    // Render empty state placeholder instead of returning null
    const codeCard = createVerticalFrame("CodeBlock");
    codeCard.layoutAlign = "STRETCH";
    applyCodeBlockStyle(codeCard, { isPlaceholder: true });
    parent.appendChild(codeCard);
    
    const placeholderNode = figma.createText();
    const monoFamily = getPath(theme, "theme.typography.font_family_mono", "Roboto Mono");
    const codeSize = Number(getPath(theme, "theme.typography.code_size", 13));
    placeholderNode.fontName = { family: monoFamily, style: "Regular" };
    placeholderNode.fontSize = codeSize;
    placeholderNode.lineHeight = { unit: "PIXELS", value: codeSize * 1.5 };
    const textColor = resolveColor(theme, tokenColors, "code_text", "#2D2D2D");
    placeholderNode.fills = [solid(textColor, 0.5)];
    placeholderNode.textAutoResize = "HEIGHT";
    placeholderNode.characters = "// Empty code block";
    codeCard.appendChild(placeholderNode);
    return codeCard;
  }

  const codeCard = createVerticalFrame("CodeBlock");
  codeCard.layoutAlign = "STRETCH";
  applyCodeBlockStyle(codeCard);
  parent.appendChild(codeCard);
  
  // Get code language
  const language = String(codeBlock.language || "");
  
  // Create language label if present
  if (language) {
    const langChip = createHorizontalFrame("CodeLanguage");
    langChip.paddingTop = 4;
    langChip.paddingBottom = 4;
    langChip.paddingLeft = 8;
    langChip.paddingRight = 8;
    langChip.fills = [solid(resolveColor(theme, tokenColors, "code_language_bg", "#E8E8E8"), 1)];
    langChip.cornerRadius = 4;
    codeCard.appendChild(langChip);
    
    createText(langChip, language, "body_small", theme, {
      colorOverride: resolveColor(theme, tokenColors, "code_text", "#2D2D2D"),
      wrap: false,
    });
  }
  
  // Create code text with monospace font
  const monoFamily = getPath(theme, "theme.typography.font_family_mono", "Roboto Mono");
  const codeSize = Number(getPath(theme, "theme.typography.code_size", 13));
  const codeLineHeight = Number(getPath(theme, "theme.typography.code_line_height", 20));
  
  const codeNode = figma.createText();
  codeNode.fontName = { family: monoFamily, style: "Regular" };
  codeNode.fontSize = codeSize;
  codeNode.lineHeight = { unit: "PIXELS", value: codeLineHeight };
  codeNode.fills = [solid(textColor, 1)];
  codeNode.textAutoResize = "HEIGHT";
  codeNode.characters = codeText;
  codeCard.appendChild(codeNode);
  
  // Resize code node to fit parent width
  const parentWidth = "width" in parent ? Number(parent.width || 0) : 0;
  const padLeft = "paddingLeft" in codeCard ? Number(codeCard.paddingLeft || 0) : 0;
  const padRight = "paddingRight" in codeCard ? Number(codeCard.paddingRight || 0) : 0;
  const targetWidth = Math.max(1, parentWidth - padLeft - padRight);
  if (targetWidth > 1) {
    codeNode.resize(targetWidth, codeNode.height);
  }
  
  return codeCard;
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
  const borderColor = resolveColor(theme, tokenColors, getPath(theme, "markdown_mapping.table.border_color", "card_border"), "#E7DDCF");
  const borderWeight = Number(getPath(theme, "components.table_card.table.border_weight", 1));
  const normalizedBorderWeight =
    Number.isFinite(borderWeight) && borderWeight > 0 ? borderWeight : 1;
  const minRowHeight = resolveTableMinRowHeight(theme, cellPaddingV);
  const minColumnWidth = Number(getPath(theme, "components.table_card.table.min_column_width", 120));
  const minReadableColumnWidth = Number(
    getPath(theme, "components.table_card.table.min_readable_column_width", 40)
  );
  const hardMinColumnWidth = Math.max(12, minReadableColumnWidth);
  const rowGap = Number(getPath(theme, "components.table_card.table.row_gap", 0));
  const columnGap = Number(getPath(theme, "components.table_card.table.column_gap", 0));
  const normalizedRowGap = Number.isFinite(rowGap) && rowGap >= 0 ? rowGap : 0;
  const normalizedColumnGap =
    Number.isFinite(columnGap) && columnGap >= 0 ? columnGap : 0;
  const headerBgColor = resolveColor(theme, tokenColors, getPath(theme, "components.table_card.table.header_bg", "table_header_bg"), null);
  const cardWidth = Number(getPath(theme, "components.card.width", 820));
  const cardPadLeft = Number(getPath(theme, "components.card.padding.left", 20));
  const cardPadRight = Number(getPath(theme, "components.card.padding.right", 20));
  const baseTableWidth = Math.max(240, cardWidth - cardPadLeft - cardPadRight);
  const minimumRequiredWidth =
    hardMinColumnWidth * columnCount +
    normalizedColumnGap * Math.max(0, columnCount - 1);
  const tableWidth = Math.max(baseTableWidth, minimumRequiredWidth);
  tableCard.itemSpacing = normalizedRowGap;

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

  const availableWidth = Math.max(
    1,
    tableWidth - normalizedColumnGap * Math.max(0, columnCount - 1)
  );
  const minWeight = Number(getPath(theme, "components.table_card.table.min_column_weight", 1));
  const maxWeight = Number(getPath(theme, "components.table_card.table.max_column_weight", 3.2));
  const columnWeights = contentScores.map((score) => {
    const baseWeight = Math.sqrt(Math.max(4, score)) / 2;
    return Math.min(maxWeight, Math.max(minWeight, baseWeight));
  });
  const totalWeight = Math.max(1, columnWeights.reduce((sum, value) => sum + value, 0));
  const columnWidths = columnWeights.map((weight) =>
    Math.max(hardMinColumnWidth, Math.floor((availableWidth * weight) / totalWeight))
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
  const enforcedMinColumnWidth = Math.max(hardMinColumnWidth, minColumnWidth);
  if (enforcedMinColumnWidth * columnCount <= availableWidth) {
    for (let i = 0; i < columnWidths.length; i += 1) {
      columnWidths[i] = Math.max(enforcedMinColumnWidth, columnWidths[i]);
    }
    let overflow =
      columnWidths.reduce((sum, value) => sum + value, 0) - availableWidth;
    while (overflow > 0) {
      let widestIndex = 0;
      for (let i = 1; i < columnWidths.length; i += 1) {
        if (columnWidths[i] > columnWidths[widestIndex]) widestIndex = i;
      }
      if (columnWidths[widestIndex] <= enforcedMinColumnWidth) break;
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
    rowFrame.itemSpacing = normalizedColumnGap;
    rowFrame.layoutAlign = "STRETCH";
    rowFrame.fills = [];
    tableCard.appendChild(rowFrame);
    const rowCells = [];
    let rowContentHeight = minRowHeight;

    for (let colIndex = 0; colIndex < columnCount; colIndex += 1) {
      const value = colIndex < row.cells.length ? String(row.cells[colIndex] ?? "") : "";
      const cell = createVerticalFrame(
        (row.isHeader ? "H" : "C") + String(colIndex + 1)
      );
      cell.primaryAxisSizingMode = "AUTO";
      cell.counterAxisSizingMode = "FIXED";
      const cellWidth = Math.max(hardMinColumnWidth, columnWidths[colIndex]);
      cell.resizeWithoutConstraints(cellWidth, 1);
      cell.layoutAlign = "STRETCH";
      cell.clipsContent = false;
      cell.paddingTop = cellPaddingV;
      cell.paddingBottom = cellPaddingV;
      cell.paddingLeft = cellPaddingH;
      cell.paddingRight = cellPaddingH;
      cell.strokes = [solid(borderColor, 1)];
      cell.strokeWeight = normalizedBorderWeight;
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
  const orderedCounters = [];

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const text = typeof item === "string" ? item : String(item?.text ?? "");
    const depth =
      typeof item === "string" ? 0 : Math.max(0, Number(item?.depth ?? 0));
    const isOrderedItem =
      typeof item === "string" ? ordered : Boolean(item?.ordered ?? ordered);

    while (orderedCounters.length > depth + 1) orderedCounters.pop();
    while (orderedCounters.length < depth + 1) orderedCounters.push(0);

    if (isOrderedItem) {
      orderedCounters[depth] += 1;
      for (let counterIndex = depth + 1; counterIndex < orderedCounters.length; counterIndex += 1) {
        orderedCounters[counterIndex] = 0;
      }
    }

    const indentPrefix = "  ".repeat(depth);
    const prefix = isOrderedItem ? String(orderedCounters[depth]) + ". " : "\\u2022 ";
    const fullPrefix = indentPrefix + prefix;
    const itemSegments =
      typeof item === "string" || !Array.isArray(item?.segments) ? null : item.segments;
    const mergedSegments = itemSegments
      ? [{ text: fullPrefix, style: "normal" }, ...itemSegments]
      : null;
    createText(parent, fullPrefix + text, "body", theme, { segments: mergedSegments });
  }
}

const model = PAYLOAD.model || {};
const theme = PAYLOAD.theme || {};
const tokenColors = PAYLOAD.tokenColors || {};
const tokenDimensions = PAYLOAD.tokenDimensions || {};
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

const page = resolvePageForSection(componentSection, componentSet);
if (!page) {
  return {
    ok: false,
    error: "Unable to resolve PAGE context for documentation section placement",
    componentSectionId: componentSection.id,
    componentSetId: componentSet.id,
  };
}

const sectionPattern = String(
  getPath(theme, "layout.target.section_name_pattern", "Doc/{component_name}")
);
const docSectionName = sectionPattern.replace("{component_name}", componentName);
const targetParent =
  componentSection && componentSection.parent
    ? componentSection.parent
    : page;
let docSection = findSectionByName(targetParent, docSectionName);
if (!docSection && targetParent !== page) {
  docSection = findSectionByName(page, docSectionName);
}
if (!docSection) {
  docSection = figma.createSection();
  docSection.name = docSectionName;
  targetParent.appendChild(docSection);
}

const offsetX = Number(
  options.offsetX != null
    ? options.offsetX
    : getPath(theme, "layout.target.position.offset_x", 200)
);
const sectionWidth = Number(getPath(theme, "layout.section.width", 940));
const minSectionHeight = Number(getPath(theme, "layout.section.min_height", 1100));

docSection.name = docSectionName;
const componentSectionBounds = getAbsoluteBounds(componentSection);
docSection.x = componentSectionBounds.x + componentSectionBounds.width + offsetX;
docSection.y = componentSectionBounds.y;
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
canvas.cornerRadius = resolveRadiusValue(
  theme,
  tokenDimensions,
  getPath(theme, "theme.radii.canvas", 24),
  24
);
canvas.fills = [solid(resolveColor(theme, tokenColors, "page_bg", "#FFF9F0"), 1)];
canvas.strokes = [solid(resolveColor(theme, tokenColors, "section_border", "#E7DDCF"), 1)];
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
  accent.cornerRadius = resolveRadiusValue(
    theme,
    tokenDimensions,
    getPath(
      theme,
      "components.header_block.accent.radius",
      getPath(theme, "theme.radii.header_accent", 12)
    ),
    12
  );
  const accentColor = resolveColor(theme, tokenColors, getPath(theme, "components.header_block.accent.fills.color", "header_accent"), "#C9E0BE");
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

// Add status badge if doc_status is present in frontmatter
const docStatus = model.frontmatter?.doc_status;
if (docStatus) {
  const statusLabel = String(docStatus).replace(/-/g, " ").toUpperCase();
  const statusChip = createHorizontalFrame("Status/" + statusLabel);
  statusChip.itemSpacing = 0;
  statusChip.layoutAlign = "FIXED";
  
  // Color coding for status
  let statusBgColor = "#F6EFE4"; // default (needs-review)
  let statusTextColor = "chip_text";
  
  if (docStatus === "draft") {
    statusBgColor = resolveColor(theme, tokenColors, "status_draft_bg", "#FFF4E5");
    statusTextColor = resolveColor(theme, tokenColors, "status_draft_text", "#B7894C");
  } else if (docStatus === "ready") {
    statusBgColor = resolveColor(theme, tokenColors, "status_ready_bg", "#E8F5E9");
    statusTextColor = resolveColor(theme, tokenColors, "status_ready_text", "#2E7D32");
  } else if (docStatus === "needs-review") {
    statusBgColor = resolveColor(theme, tokenColors, "status_needs_review_bg", "#FFF8E1");
    statusTextColor = resolveColor(theme, tokenColors, "status_needs_review_text", "#F57F17");
  }
  
  statusChip.paddingTop = 4;
  statusChip.paddingBottom = 4;
  statusChip.paddingLeft = 8;
  statusChip.paddingRight = 8;
  statusChip.fills = [solid(statusBgColor, 1)];
  statusChip.cornerRadius = 4;
  chipsRow.appendChild(statusChip);
  
  const statusText = createText(statusChip, statusLabel, "body_small", theme, {
    colorOverride: statusTextColor,
    wrap: false,
  });
}

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
    createCodeBlock(currentCard, block, theme);
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
  offsetXApplied: docSection.x - (componentSectionBounds.x + componentSectionBounds.width),
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
    `theme file (${themePath})`,
  );
  const tokenRegistryPath =
    args["token-registry"] || DEFAULT_TOKEN_REGISTRY_PATH;
  const { tokenColors, tokenDimensions } = loadTokenIndexes(tokenRegistryPath);

  const componentName =
    args["component-name"] || model.componentName || model.title || "Component";
  const outPath =
    args.out ||
    `${FIGMA_DOC_MODELS_DIR}/${String(componentName).toLowerCase()}.figma-execute.js`;
  const payloadOutPath =
    args["payload-out"] ||
    `${FIGMA_DOC_MODELS_DIR}/${String(componentName).toLowerCase()}.render-payload.json`;
  const offsetX =
    args["offset-x"] != null ? Number(args["offset-x"]) : undefined;

  const payload = {
    model,
    theme,
    tokenColors,
    tokenDimensions,
    options: {
      componentName,
      componentSetNodeId: args["component-set-id"] || null,
      offsetX,
    },
  };

  const executeCode = buildFigmaExecuteCode(payload);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${executeCode}\n`, "utf8");
  fs.writeFileSync(
    payloadOutPath,
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8",
  );

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
        tokenColorsCount: Object.keys(tokenColors).length,
        tokenDimensionsCount: Object.keys(tokenDimensions).length,
        tokenRegistryPath: fs.existsSync(path.resolve(tokenRegistryPath))
          ? path.resolve(tokenRegistryPath)
          : null,
      },
      null,
      2,
    ),
  );
}

main();
