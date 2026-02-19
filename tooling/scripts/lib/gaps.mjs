import { isPlainObject } from "./is-plain-object.mjs";

const GAP_TYPE = Object.freeze({
  SCHEMA_TBD: "SCHEMA_TBD",
  TOKEN_INVALID: "TOKEN_INVALID",
  CONTENT_UNKNOWN: "CONTENT_UNKNOWN",
  A11Y_TBD: "A11Y_TBD",
});

const GAP_TYPE_ORDER = new Map([
  [GAP_TYPE.SCHEMA_TBD, 1],
  [GAP_TYPE.TOKEN_INVALID, 2],
  [GAP_TYPE.CONTENT_UNKNOWN, 3],
  [GAP_TYPE.A11Y_TBD, 4],
]);

const COLLECTION_PREFIXES = new Set(["Semantic", "Primitives", "Components", "A11y"]);

function isGapMarker(raw) {
  return /^(?:tbd|unknown|unverified|not[-_\s]?defined)$/i.test(String(raw || "").trim());
}

function normalizeTokenPathCandidate(tokenPath) {
  const raw = String(tokenPath || "").trim();
  if (!raw) return raw;

  let normalized = raw;
  if (normalized.includes("/")) {
    const parts = normalized.split("/");
    if (parts.length > 1 && COLLECTION_PREFIXES.has(parts[0])) {
      normalized = parts.slice(1).join("/");
    }
  }

  if (normalized.startsWith("A11y.A11y.mode")) {
    normalized = normalized.replace(/^A11y\.A11y\.mode[A-Za-z0-9_-]+\./, "A11y.A11y.");
  }
  if (normalized.startsWith("A11y/A11y/mode")) {
    normalized = normalized.replace(/^A11y\/A11y\/mode[A-Za-z0-9_-]+\//, "A11y/A11y/");
  }

  return normalized;
}

function buildRegistryLookup(registry) {
  const keys = Object.keys(registry || {});
  const exact = new Set(keys);
  const lower = new Map(keys.map((key) => [key.toLowerCase(), key]));
  return { exact, lower };
}

function resolveTokenInRegistry(tokenPath, registryLookup) {
  const variants = new Set();
  const raw = String(tokenPath || "").trim();
  const normalized = normalizeTokenPathCandidate(raw);

  if (raw) variants.add(raw);
  if (normalized) variants.add(normalized);
  if (normalized && normalized !== raw) {
    variants.add(normalizeTokenPathCandidate(normalized));
  }

  for (const variant of variants) {
    if (registryLookup.exact.has(variant)) {
      return { ok: true, resolvedAs: variant };
    }
  }

  for (const variant of variants) {
    const suggested = registryLookup.lower.get(String(variant || "").toLowerCase());
    if (suggested) {
      return {
        ok: false,
        suggested,
      };
    }
  }

  return { ok: false };
}

function splitTokenValues(raw) {
  return String(raw || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function classifyUnknownPath(pathKey) {
  const key = String(pathKey || "").toLowerCase();
  if (key.startsWith("accessibility.")) return GAP_TYPE.A11Y_TBD;
  if (
    key.startsWith("anatomy.") ||
    key.startsWith("properties.") ||
    key.startsWith("summary.") ||
    key.startsWith("content_guidelines.") ||
    key.startsWith("best_practices.") ||
    key.startsWith("related_components.")
  ) {
    return GAP_TYPE.CONTENT_UNKNOWN;
  }
  return GAP_TYPE.SCHEMA_TBD;
}

function createGap(type, pathKey, value, message, suggested = "") {
  return {
    type,
    path: String(pathKey || "").trim(),
    value: String(value || "").trim(),
    message: String(message || "").trim(),
    suggested: String(suggested || "").trim(),
  };
}

function pushUnique(gaps, seen, gap) {
  const marker = `${gap.type}|${gap.path}|${gap.value}|${gap.message}|${gap.suggested}`;
  if (seen.has(marker)) return;
  seen.add(marker);
  gaps.push(gap);
}

function walkUnknownMarkers(node, pathParts, gaps, seen) {
  const pathKey = pathParts.join(".");

  if (typeof node === "string") {
    if (!isGapMarker(node)) return;
    const type = classifyUnknownPath(pathKey);
    const label =
      type === GAP_TYPE.A11Y_TBD
        ? "Accessibility detail is unresolved."
        : type === GAP_TYPE.CONTENT_UNKNOWN
        ? "Content/anatomy/property detail is unresolved."
        : "Specification value is unresolved.";
    pushUnique(
      gaps,
      seen,
      createGap(type, pathKey, node, label)
    );
    return;
  }

  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i += 1) {
      walkUnknownMarkers(node[i], pathParts.concat(`[${i}]`), gaps, seen);
    }
    return;
  }

  if (isPlainObject(node)) {
    for (const [key, value] of Object.entries(node)) {
      walkUnknownMarkers(value, pathParts.concat(key), gaps, seen);
    }
  }
}

function walkTokenMapping(node, pathParts, registryLookup, gaps, seen) {
  if (typeof node === "string") {
    const leafPath = pathParts.join(".");
    const tokenValues = splitTokenValues(node);
    for (const tokenValue of tokenValues) {
      if (isGapMarker(tokenValue)) continue;
      if (!tokenValue.includes("/") && !tokenValue.includes(".")) {
        pushUnique(
          gaps,
          seen,
          createGap(
            GAP_TYPE.TOKEN_INVALID,
            leafPath,
            tokenValue,
            "Token path is invalid.",
            ""
          )
        );
        continue;
      }
      const resolution = resolveTokenInRegistry(tokenValue, registryLookup);
      if (!resolution.ok) {
        pushUnique(
          gaps,
          seen,
          createGap(
            GAP_TYPE.TOKEN_INVALID,
            leafPath,
            tokenValue,
            "Token not found in token registry.",
            resolution.suggested || ""
          )
        );
      }
    }
    return;
  }

  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i += 1) {
      walkTokenMapping(node[i], pathParts.concat(`[${i}]`), registryLookup, gaps, seen);
    }
    return;
  }

  if (isPlainObject(node)) {
    for (const [key, value] of Object.entries(node)) {
      walkTokenMapping(value, pathParts.concat(key), registryLookup, gaps, seen);
    }
  }
}

function sortGaps(gaps) {
  return gaps.slice().sort((a, b) => {
    const rankA = GAP_TYPE_ORDER.get(a.type) || 99;
    const rankB = GAP_TYPE_ORDER.get(b.type) || 99;
    if (rankA !== rankB) return rankA - rankB;
    const pathCmp = a.path.localeCompare(b.path, "en", { sensitivity: "base" });
    if (pathCmp !== 0) return pathCmp;
    return a.value.localeCompare(b.value, "en", { sensitivity: "base" });
  });
}

export function extractGapsFromSpec({ spec, registry }) {
  const safeSpec = isPlainObject(spec) ? spec : {};
  const safeRegistry = isPlainObject(registry) ? registry : {};
  const registryLookup = buildRegistryLookup(safeRegistry);

  const gaps = [];
  const seen = new Set();

  walkUnknownMarkers(safeSpec, [], gaps, seen);
  if (isPlainObject(safeSpec.token_mapping)) {
    walkTokenMapping(
      safeSpec.token_mapping,
      ["token_mapping"],
      registryLookup,
      gaps,
      seen
    );
  }

  return sortGaps(gaps);
}

export function buildGapsChecklistLines(gaps) {
  return sortGaps(Array.isArray(gaps) ? gaps : []).map((gap) => {
    if (gap.type === GAP_TYPE.TOKEN_INVALID) {
      const suggestion = gap.suggested ? ` Suggested: \`${gap.suggested}\`.` : "";
      return `- [ ] [${gap.type}] \`${gap.path}\` references \`${gap.value}\` but it is missing in token registry.${suggestion}`;
    }
    return `- [ ] [${gap.type}] \`${gap.path}\` is \`${gap.value}\`. ${gap.message}`;
  });
}

export function extractGapsSection(rawMarkdown) {
  const markdown = String(rawMarkdown || "");
  const headingRegex = /^##\s+Gaps \/ TBD\s*$/m;
  const headingMatch = headingRegex.exec(markdown);
  if (!headingMatch) return null;

  const start = headingMatch.index;
  const headingEnd = markdown.indexOf("\n", start);
  const contentStart = headingEnd === -1 ? markdown.length : headingEnd + 1;
  const rest = markdown.slice(contentStart);
  const nextHeadingMatch = /^##\s+/m.exec(rest);
  const end = nextHeadingMatch ? contentStart + nextHeadingMatch.index : markdown.length;

  return {
    start,
    end,
    body: markdown.slice(contentStart, end).replace(/^\n+/, "").replace(/\s+$/, ""),
  };
}

export function extractNonEmptySectionLines(sectionBody) {
  return String(sectionBody || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function upsertGapsSection(rawMarkdown, gaps) {
  const markdown = String(rawMarkdown || "");
  const lines = buildGapsChecklistLines(gaps);
  const section = extractGapsSection(markdown);

  if (lines.length === 0) {
    if (!section) return markdown;
    const before = markdown.slice(0, section.start).replace(/\s+$/, "");
    const after = markdown.slice(section.end).replace(/^\s+/, "");
    let next = "";
    if (!before && !after) {
      // Safety guard: never collapse the whole document to empty when pruning gaps.
      return markdown;
    }
    if (!before) next = `${after.trimStart()}\n`;
    else if (!after) next = `${before}\n`;
    else next = `${before}\n\n${after}`;
    return next.trim().length === 0 ? markdown : next;
  }

  const newSection = `## Gaps / TBD\n\n${lines.join("\n")}\n`;

  if (!section) {
    const base = markdown.replace(/\s+$/, "");
    if (!base) return `${newSection}`;
    return `${base}\n\n${newSection}`;
  }

  const before = markdown.slice(0, section.start).replace(/\s+$/, "");
  const after = markdown.slice(section.end).replace(/^\s+/, "");
  if (!before && !after) return `${newSection}`;
  if (!before) return `${newSection}\n${after}`;
  if (!after) return `${before}\n\n${newSection}`;
  return `${before}\n\n${newSection}\n${after}`;
}
