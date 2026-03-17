import { TOKEN_COLLECTION_PREFIXES } from "../docs-config.mjs";

const DOT_TOKEN_RE = /[A-Za-z][A-Za-z0-9-]*(?:\.[A-Za-z0-9-]+){1,}/g;
const SLASH_TOKEN_RE = /[A-Za-z][A-Za-z0-9-]*(?:\/[A-Za-z0-9-]+){1,}/g;
const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const CSS_COLOR_FUNC_RE = /^(?:rgb|rgba|hsl|hsla)\(/i;
const CSS_DIMENSION_RE = /^-?\d+(?:\.\d+)?(?:px|rem|em|%)?$/i;
const TOKEN_COLLECTION_PREFIXES_LOWER = new Set(
  [...TOKEN_COLLECTION_PREFIXES].map((value) => String(value).toLowerCase()),
);

function normalizeSlashPathCandidate(tokenPath) {
  const parts = tokenPath.split("/");
  const first = String(parts[0] || "").toLowerCase();
  if (parts.length > 1 && TOKEN_COLLECTION_PREFIXES_LOWER.has(first)) {
    return parts.slice(1).join("/");
  }
  return tokenPath;
}

function normalizeA11yModePath(tokenPath) {
  if (tokenPath.startsWith("A11y.A11y.mode")) {
    return tokenPath.replace(/^A11y\.A11y\.mode[A-Za-z0-9_-]+\./, "A11y.A11y.");
  }
  if (tokenPath.startsWith("A11y/A11y/mode")) {
    return tokenPath.replace(/^A11y\/A11y\/mode[A-Za-z0-9_-]+\//, "A11y/A11y/");
  }
  return tokenPath;
}

function extractTokenCandidatesFromSpan(spanText) {
  const results = [];
  for (const regex of [DOT_TOKEN_RE, SLASH_TOKEN_RE]) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(spanText)) !== null) {
      const token = match[0]?.trim();
      if (token) results.push({ token, localOffset: match.index });
    }
  }
  return results;
}

function looksLikeTokenPath(candidate, dotRoots, slashRoots) {
  if (!candidate) return false;
  if (candidate.includes("/")) {
    const first = candidate.split("/")[0];
    if (slashRoots.has(first)) return true;
    if (TOKEN_COLLECTION_PREFIXES_LOWER.has(String(first || "").toLowerCase())) {
      return true;
    }
    return false;
  }
  if (candidate.includes(".")) {
    const first = candidate.split(".")[0];
    return dotRoots.has(first);
  }
  return false;
}

function extractResolvedTokenRefsFromText(text, registryIndexes) {
  const refs = [];
  const seen = new Set();
  const codeSpanRegex = /`([^`\n]+)`/g;
  let spanMatch;

  while ((spanMatch = codeSpanRegex.exec(String(text || ""))) !== null) {
    const span = spanMatch[1];
    const candidates = extractTokenCandidatesFromSpan(span);
    for (const item of candidates) {
      const tokenPath = item.token;
      if (
        !looksLikeTokenPath(
          tokenPath,
          registryIndexes.dotRoots,
          registryIndexes.slashRoots,
        )
      )
        continue;
      const resolution = resolveTokenCandidate(tokenPath, registryIndexes);
      if (!resolution.ok) continue;
      const dedupeKey = `${tokenPath}|${resolution.resolvedAs}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      refs.push({
        tokenPath,
        resolvedAs: resolution.resolvedAs,
        entry: registryIndexes.entriesByKey.get(resolution.resolvedAs),
      });
    }
  }

  return refs;
}

function inferFallbackKind(tokenRefs) {
  const types = new Set(
    tokenRefs
      .map((ref) =>
        String(ref.entry?.type || "")
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean),
  );
  if (types.size !== 1) return "generic";
  const onlyType = Array.from(types)[0];
  if (onlyType === "color") return "color";
  if (onlyType === "dimension") return "dimension";
  return "generic";
}

function normalizeFallbackValue(raw) {
  return String(raw || "")
    .replace(/[`*]/g, "")
    .trim()
    .replace(/^[\(\[]+/, "")
    .replace(/[\)\].,:;]+$/, "")
    .trim();
}

function hasConcreteFallbackValue(raw) {
  const value = normalizeFallbackValue(raw);
  return !!value && !/^tbd$/i.test(value) && !/^[-—]+$/.test(value);
}

function isFallbackCompatible(raw, kind) {
  const value = normalizeFallbackValue(raw);
  if (!hasConcreteFallbackValue(value)) return false;

  if (kind === "color") {
    if (CSS_COLOR_FUNC_RE.test(value)) return true;
    const parts = value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    return parts.every(
      (part) => HEX_COLOR_RE.test(part) || /^transparent$/i.test(part),
    );
  }
  if (kind === "dimension") {
    return CSS_DIMENSION_RE.test(value);
  }

  return true;
}

function extractFallbackFromLine(line, registryIndexes) {
  const rawLine = String(line || "");
  if (!rawLine) return "";

  const codeSpanRegex = /`([^`\n]+)`/g;
  const codeSpans = [];
  let match;
  while ((match = codeSpanRegex.exec(rawLine)) !== null) {
    codeSpans.push(match[1]);
  }

  for (const span of codeSpans) {
    const isTokenLike = extractTokenCandidatesFromSpan(span).some((candidate) =>
      looksLikeTokenPath(
        candidate.token,
        registryIndexes.dotRoots,
        registryIndexes.slashRoots,
      ),
    );
    if (!isTokenLike && hasConcreteFallbackValue(span)) return span;
  }

  const explicitFallbackMatch = rawLine.match(/fallback[^:]*:\s*([^|]+)$/i);
  if (
    explicitFallbackMatch &&
    hasConcreteFallbackValue(explicitFallbackMatch[1])
  ) {
    return explicitFallbackMatch[1];
  }

  const parentheticalMatch = rawLine.match(/\(([^)]+)\)/);
  if (parentheticalMatch && hasConcreteFallbackValue(parentheticalMatch[1])) {
    return parentheticalMatch[1];
  }

  return "";
}

function normalizeCellText(cell) {
  return String(cell || "")
    .replace(/`/g, "")
    .trim();
}

function isTableLine(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed || /^```/.test(trimmed)) return false;
  const pipeCount = (trimmed.match(/\|/g) || []).length;
  return pipeCount >= 1;
}

function parseTableCells(line) {
  let trimmed = String(line || "").trim();
  if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
  if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1);
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

function isSeparatorRow(cells) {
  if (!Array.isArray(cells) || cells.length === 0) return false;
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")));
}

function collectMarkdownTables(content) {
  const lines = String(content || "").split("\n");
  const lineOffsets = [];
  let offset = 0;
  for (const line of lines) {
    lineOffsets.push(offset);
    offset += line.length + 1;
  }

  const tables = [];
  let i = 0;
  while (i < lines.length) {
    if (!isTableLine(lines[i])) {
      i += 1;
      continue;
    }

    let j = i;
    while (j < lines.length && isTableLine(lines[j])) j += 1;
    const blockLength = j - i;

    if (blockLength >= 2) {
      const headerCells = parseTableCells(lines[i]);
      const separatorCells = parseTableCells(lines[i + 1]);
      if (isSeparatorRow(separatorCells)) {
        const rows = [];
        for (let k = i + 2; k < j; k += 1) {
          rows.push({
            cells: parseTableCells(lines[k]),
            offset: lineOffsets[k],
          });
        }
        tables.push({
          headerCells,
          headerOffset: lineOffsets[i],
          rows,
        });
      }
    }

    i = j;
  }

  return tables;
}

function findHeaderIndex(cells, needle) {
  const key = String(needle || "")
    .trim()
    .toLowerCase();
  return cells.findIndex((cell) =>
    normalizeCellText(cell).toLowerCase().includes(key),
  );
}

function isMissingFallbackValue(cell) {
  return !hasConcreteFallbackValue(cell);
}

export function buildRegistryIndexes(registryObj) {
  const keys = Object.keys(registryObj);
  const keySet = new Set(keys);
  const lowerMap = new Map(keys.map((key) => [key.toLowerCase(), key]));
  const entriesByKey = new Map(keys.map((key) => [key, registryObj[key]]));

  const dotRoots = new Set();
  const slashRoots = new Set();
  for (const key of keys) {
    if (key.includes(".")) dotRoots.add(key.split(".")[0]);
    if (key.includes("/")) slashRoots.add(key.split("/")[0]);
  }

  return { keySet, lowerMap, dotRoots, slashRoots, entriesByKey };
}

export function resolveTokenCandidate(candidate, registryIndexes) {
  const { keySet, lowerMap } = registryIndexes;
  const variants = new Set();

  variants.add(candidate);
  variants.add(normalizeA11yModePath(candidate));
  variants.add(normalizeSlashPathCandidate(candidate));
  variants.add(normalizeSlashPathCandidate(normalizeA11yModePath(candidate)));

  for (const variant of variants) {
    if (!variant) continue;
    if (keySet.has(variant)) return { ok: true, resolvedAs: variant };
  }

  for (const variant of variants) {
    if (!variant) continue;
    const hit = lowerMap.get(variant.toLowerCase());
    if (hit) {
      return {
        ok: false,
        suggested: hit,
        message: `Token reference has case mismatch: \`${candidate}\` (expected \`${hit}\`).`,
      };
    }
  }

  return {
    ok: false,
    message: `Token reference not found in registry: \`${candidate}\`.`,
  };
}

export function validateTokenReferences(
  filePath,
  content,
  registryIndexes,
  report,
  lineStarts,
  lineFromOffset,
  baseOffset = 0,
) {
  const codeSpanRegex = /`([^`\n]+)`/g;
  let spanMatch;
  const seen = new Set();

  while ((spanMatch = codeSpanRegex.exec(content)) !== null) {
    const span = spanMatch[1];
    const spanOffset = spanMatch.index + 1;
    const candidates = extractTokenCandidatesFromSpan(span);

    for (const item of candidates) {
      const tokenPath = item.token;
      if (
        !looksLikeTokenPath(
          tokenPath,
          registryIndexes.dotRoots,
          registryIndexes.slashRoots,
        )
      )
        continue;

      const absoluteOffset = baseOffset + spanOffset + item.localOffset;
      const line = lineFromOffset(lineStarts, absoluteOffset);
      const dedupeKey = `${tokenPath}@${line}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      report.summary.tokenRefsChecked += 1;
      const resolution = resolveTokenCandidate(tokenPath, registryIndexes);
      if (!resolution.ok) {
        report.summary.tokenRefsInvalid += 1;
        report.errors.push({
          code: "TOK01",
          file: filePath,
          line,
          token: tokenPath,
          message: resolution.message,
          suggested: resolution.suggested,
        });
      }
    }
  }
}

export function validateTokenFallbacks(
  filePath,
  content,
  registryIndexes,
  report,
  lineStarts,
  lineFromOffset,
  baseOffset = 0,
) {
  const tables = collectMarkdownTables(content);
  for (const table of tables) {
    const tokenCol = findHeaderIndex(table.headerCells, "token");
    if (tokenCol < 0) continue;

    const rowsWithTokenRefs = table.rows
      .map((row) => {
        const tokenCell = row.cells[tokenCol] || "";
        if (/^`?tbd`?$/i.test(normalizeCellText(tokenCell))) return null;
        const tokenRefs = extractResolvedTokenRefsFromText(
          tokenCell,
          registryIndexes,
        );
        if (tokenRefs.length === 0) return null;
        return { row, tokenRefs };
      })
      .filter(Boolean);
    if (rowsWithTokenRefs.length === 0) continue;

    const fallbackCol = findHeaderIndex(table.headerCells, "fallback");
    if (fallbackCol < 0) {
      report.errors.push({
        code: "TOK02",
        file: filePath,
        line: lineFromOffset(lineStarts, baseOffset + table.headerOffset),
        message: "Token table must include a `Fallback` column.",
      });
      continue;
    }

    for (const item of rowsWithTokenRefs) {
      const { row, tokenRefs } = item;
      const fallbackCell = row.cells[fallbackCol] || "";
      const line = lineFromOffset(lineStarts, baseOffset + row.offset);

      if (isMissingFallbackValue(fallbackCell)) {
        report.errors.push({
          code: "TOK02",
          file: filePath,
          line,
          message:
            "Token reference row is missing fallback value in `Fallback` column.",
        });
        continue;
      }

      const fallbackKind = inferFallbackKind(tokenRefs);
      if (!isFallbackCompatible(fallbackCell, fallbackKind)) {
        const expected =
          fallbackKind === "color"
            ? "a concrete color fallback (hex/rgb/hsl)"
            : fallbackKind === "dimension"
              ? "a concrete dimension fallback (px/rem/number)"
              : "a concrete fallback value";
        report.errors.push({
          code: "TOK02",
          file: filePath,
          line,
          message: `Fallback is present but not valid for token type; expected ${expected}.`,
        });
      }
    }
  }

  validateProseTokenFallbacks(
    filePath,
    content,
    registryIndexes,
    report,
    lineStarts,
    lineFromOffset,
    baseOffset,
    tables,
  );
}

function validateProseTokenFallbacks(
  filePath,
  content,
  registryIndexes,
  report,
  lineStarts,
  lineFromOffset,
  baseOffset = 0,
  tables = collectMarkdownTables(content),
) {
  const lines = String(content || "").split("\n");
  const lineOffsets = [];
  let runningOffset = 0;
  for (const line of lines) {
    lineOffsets.push(runningOffset);
    runningOffset += line.length + 1;
  }

  const tableLineSet = new Set();
  for (const table of tables) {
    const firstLine = lines.findIndex(
      (_, idx) => lineOffsets[idx] === table.headerOffset,
    );
    if (firstLine < 0) continue;
    const lastLine = firstLine + table.rows.length + 1;
    for (let i = firstLine; i <= lastLine; i += 1) tableLineSet.add(i);
  }

  for (let i = 0; i < lines.length; i += 1) {
    if (tableLineSet.has(i)) continue;
    const line = lines[i];
    if (!line || !line.includes("`")) continue;

    const tokenRefs = extractResolvedTokenRefsFromText(line, registryIndexes);
    if (tokenRefs.length === 0) continue;

    let fallback = extractFallbackFromLine(line, registryIndexes);
    if (!fallback) {
      for (let j = i + 1; j <= Math.min(i + 2, lines.length - 1); j += 1) {
        if (tableLineSet.has(j)) break;
        const nextLine = lines[j];
        if (!nextLine.trim()) continue;
        if (!/fallback/i.test(nextLine)) break;
        fallback = extractFallbackFromLine(nextLine, registryIndexes);
        if (fallback) break;
      }
    }

    const lineNumber = lineFromOffset(lineStarts, baseOffset + lineOffsets[i]);
    if (!hasConcreteFallbackValue(fallback)) {
      report.errors.push({
        code: "TOK02",
        file: filePath,
        line: lineNumber,
        message:
          "Token reference in prose is missing a concrete fallback value.",
      });
      continue;
    }

    const fallbackKind = inferFallbackKind(tokenRefs);
    if (!isFallbackCompatible(fallback, fallbackKind)) {
      const expected =
        fallbackKind === "color"
          ? "a concrete color fallback (hex/rgb/hsl)"
          : fallbackKind === "dimension"
            ? "a concrete dimension fallback (px/rem/number)"
            : "a concrete fallback value";
      report.errors.push({
        code: "TOK02",
        file: filePath,
        line: lineNumber,
        message: `Token reference in prose has invalid fallback; expected ${expected}.`,
      });
    }
  }
}
