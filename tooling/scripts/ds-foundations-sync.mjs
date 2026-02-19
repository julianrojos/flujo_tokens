#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import { parseArgs, printUsage } from "./lib/parse-args.mjs";
import { DOCS_ROOT } from "./lib/paths.mjs";

const USAGE = {
  command: "npm run ds:foundations:sync -- --create-root true",
  description:
    "Generate deterministic foundations markdown pages from docs/_generated/token-registry.json.",
  options: [
    {
      name: "--docs-root <path>",
      description: "Docs root path.",
      defaultValue: "docs",
    },
    {
      name: "--foundations-root <path>",
      description: "Foundations docs directory.",
      defaultValue: "docs/foundations",
    },
    {
      name: "--registry <path>",
      description: "Token registry JSON path.",
      defaultValue: "docs/_generated/token-registry.json",
    },
    {
      name: "--status <draft|ready|needs-review>",
      description: "Frontmatter doc_status for generated pages.",
      defaultValue: "draft",
    },
    {
      name: "--max-samples <number>",
      description: "Maximum token samples per group row.",
      defaultValue: "2",
    },
    {
      name: "--create-root <true|false>",
      description:
        "Create docs/foundations when missing. Keep false unless explicitly requested.",
      defaultValue: "false",
    },
    {
      name: "--dry-run <true|false>",
      description: "Report changes without writing files.",
      defaultValue: "false",
    },
    {
      name: "--help",
      description: "Show this help message.",
    },
  ],
};

const DOC_STATUS_ALLOWED = new Set(["draft", "ready", "needs-review"]);
const CSS_VAR_REF_RE = /^var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([^()]+?)\s*)?\)$/i;
const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const CSS_COLOR_FUNC_RE = /^(?:rgb|rgba|hsl|hsla)\(/i;
const CSS_DIMENSION_RE = /^-?\d+(?:\.\d+)?(?:px|rem|em|%)?$/i;
const DEFAULT_STATUS = "draft";

const OPTIONAL_GENERATED_DOCS = [
  "tokens.inventory.md",
  "tokens.alias-resolution.md",
  "a11y.modes.md",
];

function normalizeEntry(raw) {
  const entry = raw && typeof raw === "object" ? raw : {};
  return {
    path: String(entry.path || "").trim(),
    slashPath: String(entry.slashPath || "").trim(),
    cssVar: String(entry.cssVar || "").trim(),
    type: String(entry.type || "").trim().toLowerCase(),
    resolvedValue: String(entry.resolvedValue || "").trim(),
    collection: String(entry.collection || "").trim(),
  };
}

function loadRegistryEntries(registryPath) {
  const absolutePath = path.resolve(registryPath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(
      `Token registry not found: ${absolutePath}. Run \`npm run ds:tokens-sync\` first.`,
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid token registry JSON at ${absolutePath}: ${reason}`);
  }

  let entries = [];
  if (parsed && typeof parsed === "object" && Array.isArray(parsed.entries)) {
    entries = parsed.entries;
  } else if (Array.isArray(parsed)) {
    entries = parsed;
  } else if (parsed && typeof parsed === "object") {
    entries = Object.values(parsed);
  }

  const deduped = [];
  const seen = new Set();

  for (const rawEntry of entries) {
    const entry = normalizeEntry(rawEntry);
    if (!entry.path && !entry.slashPath) continue;
    const marker = [entry.path, entry.slashPath, entry.cssVar, entry.collection].join("|");
    if (seen.has(marker)) continue;
    seen.add(marker);
    deduped.push(entry);
  }

  deduped.sort((a, b) => {
    const keyA = `${a.path}|${a.slashPath}|${a.cssVar}`;
    const keyB = `${b.path}|${b.slashPath}|${b.cssVar}`;
    return keyA.localeCompare(keyB, "en", { sensitivity: "base" });
  });

  return deduped;
}

function isConcreteColor(value) {
  const raw = String(value || "").trim();
  return HEX_COLOR_RE.test(raw) || CSS_COLOR_FUNC_RE.test(raw);
}

function isConcreteDimension(value) {
  return CSS_DIMENSION_RE.test(String(value || "").trim());
}

function parseVarReference(value) {
  const raw = String(value || "").trim();
  const match = raw.match(CSS_VAR_REF_RE);
  if (!match) return null;
  return {
    cssVar: String(match[1] || "").trim(),
    fallback: String(match[2] || "").trim(),
  };
}

function buildCssVarIndex(entries) {
  const index = new Map();
  for (const entry of entries) {
    if (!entry.cssVar) continue;
    if (!index.has(entry.cssVar)) index.set(entry.cssVar, entry);
  }
  return index;
}

function resolveConcreteValue(entry, cssVarIndex, visited = new Set()) {
  const raw = String(entry?.resolvedValue || "").trim();
  if (!raw) return "";

  const varRef = parseVarReference(raw);
  if (!varRef) return raw;

  const { cssVar, fallback } = varRef;
  if (!cssVar || visited.has(cssVar)) {
    return fallback || "";
  }

  visited.add(cssVar);
  const targetEntry = cssVarIndex.get(cssVar);
  if (!targetEntry) {
    return fallback || "";
  }

  const resolved = resolveConcreteValue(targetEntry, cssVarIndex, visited);
  if (resolved) return resolved;
  return fallback || "";
}

function computeFallback(entry, cssVarIndex) {
  const resolved = String(resolveConcreteValue(entry, cssVarIndex) || "").trim();
  if (!resolved) return "";

  if (entry.type === "color") {
    return isConcreteColor(resolved) ? resolved : "";
  }

  if (entry.type === "dimension") {
    return isConcreteDimension(resolved) ? resolved : "";
  }

  return resolved;
}

function tokenRef(entry, fallback) {
  const tokenPath = entry.slashPath || entry.path;
  if (!tokenPath || !fallback) return "";
  return `\`${tokenPath}\` (\`${fallback}\`)`;
}

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeSortKey(value) {
  return normalizeText(value).toLowerCase();
}

function groupKeyFromSlashPath(entry, depth = 2) {
  const slash = String(entry.slashPath || "").trim();
  if (!slash) return entry.collection || "Other";
  const parts = slash.split("/").filter(Boolean);
  if (parts.length === 0) return entry.collection || "Other";
  return parts.slice(0, Math.max(1, depth)).join("/");
}

function buildGroupRows(entries, cssVarIndex, { depth = 2, maxSamples = 2, filter } = {}) {
  const groups = new Map();

  for (const entry of entries) {
    if (typeof filter === "function" && !filter(entry)) continue;
    const key = groupKeyFromSlashPath(entry, depth);
    if (!groups.has(key)) {
      groups.set(key, { key, entries: [] });
    }
    groups.get(key).entries.push(entry);
  }

  const rows = Array.from(groups.values())
    .map((group) => {
      group.entries.sort((a, b) => {
        const keyA = `${a.path}|${a.slashPath}`;
        const keyB = `${b.path}|${b.slashPath}`;
        return keyA.localeCompare(keyB, "en", { sensitivity: "base" });
      });

      const samples = [];
      for (const entry of group.entries) {
        const fallback = computeFallback(entry, cssVarIndex);
        const ref = tokenRef(entry, fallback);
        if (!ref) continue;
        samples.push(ref);
        if (samples.length >= maxSamples) break;
      }

      return {
        group: group.key,
        count: group.entries.length,
        sample: samples.join("; "),
      };
    })
    .sort((a, b) => a.group.localeCompare(b.group, "en", { sensitivity: "base" }));

  return rows;
}

function filterEntries(entries, predicate) {
  return entries.filter((entry) => {
    try {
      return predicate(entry);
    } catch {
      return false;
    }
  });
}

function lowerSearch(entry) {
  return `${entry.path} ${entry.slashPath} ${entry.collection} ${entry.type}`.toLowerCase();
}

function isFoundationCollection(entry) {
  return normalizeText(entry.collection).toLowerCase() !== "components";
}

function renderFrontmatter({ docType, status }) {
  return `---\ndoc_type: ${docType}\ndoc_status: ${status}\n---\n`;
}

function renderGroupTable(rows) {
  if (!rows.length) return "TBD";
  const lines = [
    "| Group | Tokens | Sample |",
    "| ----- | -----: | ------ |",
  ];

  for (const row of rows) {
    lines.push(
      `| ${row.group} | ${row.count} | ${row.sample || "TBD"} |`,
    );
  }
  return lines.join("\n");
}

function renderGapsSection(gaps) {
  if (!gaps.length) return "";
  const lines = ["## Gaps / TBD", ""];
  for (const gap of gaps) {
    lines.push(`- [ ] [${gap.type}] ${gap.message}`);
  }
  return `${lines.join("\n")}\n`;
}

function fileExists(filePath) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

function buildOptionalArtifactsInfo(docsRoot) {
  const generatedDir = path.join(docsRoot, "_generated");
  const rows = OPTIONAL_GENERATED_DOCS.map((fileName) => {
    const absolutePath = path.join(generatedDir, fileName);
    return {
      fileName,
      exists: fileExists(absolutePath),
      relativeLink: `../_generated/${fileName}`,
    };
  });
  return rows;
}

function buildColorPage({
  entries,
  cssVarIndex,
  status,
  optionalArtifacts,
  maxSamples,
}) {
  const gaps = [];
  const colorEntries = filterEntries(
    entries,
    (entry) => isFoundationCollection(entry) && entry.type === "color",
  );

  const semanticCategories = Array.from(
    new Set(
      colorEntries
        .filter((entry) => normalizeText(entry.collection).toLowerCase() === "semantic")
        .map((entry) => {
          const parts = String(entry.path || "").split(".");
          return parts.length >= 3 ? normalizeText(parts[2]) : "";
        })
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));

  if (!semanticCategories.length) {
    gaps.push({
      type: "MISSING_SEMANTIC_MODEL",
      message: "No semantic color categories were detected in token registry.",
    });
  }

  const groupRows = buildGroupRows(colorEntries, cssVarIndex, {
    depth: 2,
    maxSamples,
    filter: (entry) => {
      const text = lowerSearch(entry);
      return text.includes("color");
    },
  });

  if (!groupRows.length) {
    gaps.push({
      type: "MISSING_TOKEN_GROUPS",
      message: "No color token groups with concrete fallbacks were generated.",
    });
  }

  const seeAlsoLines = [
    "- Token registry: [`../_generated/token-registry.json`](../_generated/token-registry.json)",
  ];

  for (const artifact of optionalArtifacts) {
    if (artifact.exists) {
      seeAlsoLines.push(
        `- ${artifact.fileName}: [\`${artifact.relativeLink}\`](${artifact.relativeLink})`,
      );
    } else {
      gaps.push({
        type: "MISSING_ARTIFACT",
        message: `Optional generated artifact is missing: \`docs/_generated/${artifact.fileName}\`.`,
      });
    }
  }

  const lines = [
    renderFrontmatter({ docType: "foundation", status }).trimEnd(),
    "",
    "# Color Foundations",
    "",
    "Token-driven color foundations derived from `docs/_generated/token-registry.json`.",
    "",
    "## Purpose",
    "",
    "Define shared color families and semantic intent levels used across documentation.",
    "",
    "## Semantic Model",
    "",
  ];

  if (semanticCategories.length) {
    lines.push(
      `Detected semantic categories: ${semanticCategories.map((value) => `\`${value}\``).join(", ")}.`,
    );
  } else {
    lines.push("TBD");
  }

  lines.push(
    "",
    "## Key Token Groups",
    "",
    renderGroupTable(groupRows),
    "",
    "## See Also",
    "",
    ...seeAlsoLines,
    "",
  );

  const gapsSection = renderGapsSection(gaps);
  if (gapsSection) lines.push(gapsSection.trimEnd(), "");

  return {
    title: "Color",
    fileName: "color.md",
    content: `${lines.join("\n").replace(/\n{3,}/g, "\n\n")}\n`,
    gaps,
  };
}

function parseNumericFromString(raw) {
  const match = String(raw || "").trim().match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function buildTypographyPage({ entries, cssVarIndex, status, maxSamples }) {
  const gaps = [];
  const typographyEntries = filterEntries(
    entries,
    (entry) => normalizeText(entry.collection).toLowerCase() === "typography",
  );

  const familyRows = buildGroupRows(typographyEntries, cssVarIndex, {
    depth: 3,
    maxSamples,
    filter: (entry) => lowerSearch(entry).includes("font/family"),
  });

  const sizeRows = buildGroupRows(typographyEntries, cssVarIndex, {
    depth: 3,
    maxSamples,
    filter: (entry) => lowerSearch(entry).includes("font/size"),
  });

  const lineHeightRows = buildGroupRows(typographyEntries, cssVarIndex, {
    depth: 3,
    maxSamples,
    filter: (entry) => lowerSearch(entry).includes("line-height"),
  });

  const weightRows = buildGroupRows(typographyEntries, cssVarIndex, {
    depth: 3,
    maxSamples,
    filter: (entry) => lowerSearch(entry).includes("font/weight"),
  });

  const sizeValues = typographyEntries
    .filter((entry) => lowerSearch(entry).includes("font/size"))
    .map((entry) => parseNumericFromString(computeFallback(entry, cssVarIndex)))
    .filter((value) => Number.isFinite(value));

  let typeScaleLine = "TBD";
  if (sizeValues.length > 0) {
    const min = Math.min(...sizeValues);
    const max = Math.max(...sizeValues);
    typeScaleLine = `Detected size range: \`${min}\` to \`${max}\`.`;
  } else {
    gaps.push({
      type: "MISSING_TYPE_SCALE",
      message: "No resolvable typography size tokens were detected.",
    });
  }

  if (!familyRows.length) {
    gaps.push({
      type: "MISSING_FAMILY_TOKENS",
      message: "No font family token rows were generated.",
    });
  }

  const lines = [
    renderFrontmatter({ docType: "foundation", status }).trimEnd(),
    "",
    "# Typography Foundations",
    "",
    "Typography foundations derived from `docs/_generated/token-registry.json`.",
    "",
    "## Type Scale Overview",
    "",
    typeScaleLine,
    "",
    "## Families, Sizes, Line-Heights, Weights",
    "",
    "### Families",
    "",
    renderGroupTable(familyRows),
    "",
    "### Sizes",
    "",
    renderGroupTable(sizeRows),
    "",
    "### Line-Heights",
    "",
    renderGroupTable(lineHeightRows),
    "",
    "### Weights",
    "",
    renderGroupTable(weightRows),
    "",
    "## Semantic Typography Mapping",
    "",
    "TBD",
    "",
  ];

  const gapsSection = renderGapsSection(gaps);
  if (gapsSection) lines.push(gapsSection.trimEnd(), "");

  return {
    title: "Typography",
    fileName: "typography.md",
    content: `${lines.join("\n").replace(/\n{3,}/g, "\n\n")}\n`,
    gaps,
  };
}

function buildSpacingSizingPage({ entries, cssVarIndex, status, maxSamples }) {
  const gaps = [];
  const dimensionEntries = filterEntries(entries, (entry) => {
    if (!isFoundationCollection(entry)) return false;
    if (entry.type !== "dimension") return false;
    const text = lowerSearch(entry);
    if (text.includes("font/size") || text.includes("line-height")) return false;
    if (text.includes("focus-outline") || text.includes("hit-area") || text.includes("a11y")) return false;
    return true;
  });

  const groupRows = buildGroupRows(dimensionEntries, cssVarIndex, {
    depth: 3,
    maxSamples,
    filter: (entry) => {
      const text = lowerSearch(entry);
      return (
        text.includes("spacing") ||
        text.includes("radius") ||
        text.includes("border") ||
        text.includes("size") ||
        text.includes("padding") ||
        text.includes("margin") ||
        text.includes("width") ||
        text.includes("height")
      );
    },
  });

  if (!groupRows.length) {
    gaps.push({
      type: "MISSING_DIMENSION_GROUPS",
      message: "No spacing/sizing token groups were detected with concrete fallbacks.",
    });
  }

  const lines = [
    renderFrontmatter({ docType: "foundation", status }).trimEnd(),
    "",
    "# Spacing and Sizing Foundations",
    "",
    "Spacing and sizing families derived from `docs/_generated/token-registry.json`.",
    "",
    "## Spacing Principles",
    "",
    "TBD",
    "",
    "## Token Families",
    "",
    renderGroupTable(groupRows),
    "",
  ];

  const gapsSection = renderGapsSection(gaps);
  if (gapsSection) lines.push(gapsSection.trimEnd(), "");

  return {
    title: "Spacing & Sizing",
    fileName: "spacing-sizing.md",
    content: `${lines.join("\n").replace(/\n{3,}/g, "\n\n")}\n`,
    gaps,
  };
}

function buildElevationPage({ entries, cssVarIndex, status, maxSamples }) {
  const gaps = [];
  const elevationEntries = filterEntries(entries, (entry) => {
    if (!isFoundationCollection(entry)) return false;
    const text = lowerSearch(entry);
    return text.includes("shadow") || text.includes("elevation");
  });

  const groupRows = buildGroupRows(elevationEntries, cssVarIndex, {
    depth: 3,
    maxSamples,
  });

  if (!groupRows.length) {
    gaps.push({
      type: "MISSING_ELEVATION_TOKENS",
      message: "No shadow/elevation token groups were detected.",
    });
  }

  const lines = [
    renderFrontmatter({ docType: "foundation", status }).trimEnd(),
    "",
    "# Elevation Foundations",
    "",
    "Elevation foundations based on shadow/elevation tokens in the registry.",
    "",
    "## Elevation Model",
    "",
    "Define visual depth using shared token families instead of ad-hoc values.",
    "",
    "## Shadow and Elevation Families",
    "",
    renderGroupTable(groupRows),
    "",
    "## Platform Notes",
    "",
    "TBD",
    "",
  ];

  const gapsSection = renderGapsSection(gaps);
  if (gapsSection) lines.push(gapsSection.trimEnd(), "");

  return {
    title: "Elevation",
    fileName: "elevation.md",
    content: `${lines.join("\n").replace(/\n{3,}/g, "\n\n")}\n`,
    gaps,
  };
}

function buildIconographyPage({ entries, cssVarIndex, status, maxSamples }) {
  const gaps = [];
  const iconEntries = filterEntries(entries, (entry) => {
    if (!isFoundationCollection(entry)) return false;
    return lowerSearch(entry).includes("icon");
  });

  const iconRows = buildGroupRows(iconEntries, cssVarIndex, {
    depth: 3,
    maxSamples,
  });

  const hitAreaEntries = filterEntries(entries, (entry) => {
    const text = lowerSearch(entry);
    return text.includes("hit-area");
  });

  const hitAreaRows = buildGroupRows(hitAreaEntries, cssVarIndex, {
    depth: 3,
    maxSamples,
  });

  if (!iconRows.length) {
    gaps.push({
      type: "MISSING_ICON_TOKENS",
      message: "No icon-related token groups were detected.",
    });
  }

  if (!hitAreaRows.length) {
    gaps.push({
      type: "MISSING_HIT_AREA_TOKENS",
      message: "No hit-area token rows were detected for iconography guidance.",
    });
  }

  const lines = [
    renderFrontmatter({ docType: "foundation", status }).trimEnd(),
    "",
    "# Iconography Foundations",
    "",
    "Token hooks and accessibility notes for iconography.",
    "",
    "## Icon Token Families",
    "",
    renderGroupTable(iconRows),
    "",
    "## Minimum Hit Area",
    "",
    renderGroupTable(hitAreaRows),
    "",
    "## Asset Inventory Policy",
    "",
    "TBD",
    "",
  ];

  const gapsSection = renderGapsSection(gaps);
  if (gapsSection) lines.push(gapsSection.trimEnd(), "");

  return {
    title: "Iconography",
    fileName: "iconography.md",
    content: `${lines.join("\n").replace(/\n{3,}/g, "\n\n")}\n`,
    gaps,
  };
}

function buildA11yPage({
  entries,
  cssVarIndex,
  status,
  optionalModesArtifact,
  maxSamples,
}) {
  const gaps = [];
  const a11yEntries = filterEntries(entries, (entry) => {
    const text = lowerSearch(entry);
    return (
      normalizeText(entry.collection).toLowerCase() === "a11y" ||
      text.includes("focus-outline") ||
      text.includes("hit-area")
    );
  });

  const focusRows = buildGroupRows(a11yEntries, cssVarIndex, {
    depth: 4,
    maxSamples,
    filter: (entry) => lowerSearch(entry).includes("focus-outline"),
  });

  const hitAreaRows = buildGroupRows(a11yEntries, cssVarIndex, {
    depth: 4,
    maxSamples,
    filter: (entry) => lowerSearch(entry).includes("hit-area"),
  });

  if (!focusRows.length) {
    gaps.push({
      type: "MISSING_FOCUS_TOKENS",
      message: "No focus outline token rows were detected.",
    });
  }

  if (!hitAreaRows.length) {
    gaps.push({
      type: "MISSING_HIT_AREA_TOKENS",
      message: "No hit-area token rows were detected.",
    });
  }

  const modeLine = optionalModesArtifact.exists
    ? `Mode details: [\`${optionalModesArtifact.relativeLink}\`](${optionalModesArtifact.relativeLink})`
    : "TBD";

  if (!optionalModesArtifact.exists) {
    gaps.push({
      type: "MISSING_ARTIFACT",
      message: "Optional generated modes artifact is missing: `docs/_generated/a11y.modes.md`.",
    });
  }

  const lines = [
    renderFrontmatter({ docType: "foundation", status }).trimEnd(),
    "",
    "# Accessibility Foundations",
    "",
    "Accessibility-oriented tokens and constraints derived from the token registry.",
    "",
    "## Scope",
    "",
    "Document focus indicators, hit areas, and mode-aware token references for accessibility baselines.",
    "",
    "## Modes",
    "",
    modeLine,
    "",
    "## Focus Indicator Tokens",
    "",
    renderGroupTable(focusRows),
    "",
    "## Touch Target Tokens",
    "",
    renderGroupTable(hitAreaRows),
    "",
  ];

  const gapsSection = renderGapsSection(gaps);
  if (gapsSection) lines.push(gapsSection.trimEnd(), "");

  return {
    title: "A11y",
    fileName: "a11y.md",
    content: `${lines.join("\n").replace(/\n{3,}/g, "\n\n")}\n`,
    gaps,
  };
}

function buildOverviewPage({ status, pages }) {
  const overviewEntries = pages
    .map((page) => ({
      title: page.title,
      fileName: page.fileName,
    }))
    .sort((a, b) => normalizeSortKey(a.title).localeCompare(normalizeSortKey(b.title)));

  const lines = [
    renderFrontmatter({ docType: "overview", status }).trimEnd(),
    "",
    "# Foundations",
    "",
    "Foundational documentation generated from token registry artifacts.",
    "",
    "## Included Pages",
    "",
    ...overviewEntries.map((entry) => `- [${entry.title}](${entry.fileName})`),
    "",
    "## Source of Truth",
    "",
    "- Token registry: [`../_generated/token-registry.json`](../_generated/token-registry.json)",
    "- Generate tokens and registry with `npm run ds:tokens-sync`.",
    "",
  ];

  return {
    fileName: "overview.md",
    content: `${lines.join("\n").replace(/\n{3,}/g, "\n\n")}\n`,
  };
}

function writeFileIfChanged(filePath, content, dryRun) {
  const current = fileExists(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  const changed = current !== content;
  if (changed && !dryRun) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, "utf8");
  }
  return changed;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (String(args.help || "false") === "true") {
    printUsage(USAGE, { exitCode: 0 });
  }

  const docsRoot = path.resolve(args["docs-root"] || DOCS_ROOT);
  const foundationsRoot = path.resolve(
    args["foundations-root"] || path.join(docsRoot, "foundations"),
  );
  const registryPath = path.resolve(
    args.registry || path.join(docsRoot, "_generated", "token-registry.json"),
  );

  const status = String(args.status || DEFAULT_STATUS).trim().toLowerCase();
  const createRoot = String(args["create-root"] || "false") === "true";
  const dryRun = String(args["dry-run"] || "false") === "true";
  const maxSamplesRaw = Number(args["max-samples"] || 2);
  const maxSamples = Number.isFinite(maxSamplesRaw) && maxSamplesRaw > 0
    ? Math.floor(maxSamplesRaw)
    : 2;

  if (!DOC_STATUS_ALLOWED.has(status)) {
    process.stderr.write(
      `Invalid --status value: ${status}. Allowed: ${Array.from(DOC_STATUS_ALLOWED).join(", ")}\n`,
    );
    process.exit(1);
  }

  if (!fs.existsSync(foundationsRoot) && !createRoot) {
    process.stderr.write(
      "Foundations directory does not exist. Use --create-root true to create it explicitly.\n" +
        `Path: ${foundationsRoot}\n`,
    );
    process.exit(1);
  }

  const entries = loadRegistryEntries(registryPath);
  const cssVarIndex = buildCssVarIndex(entries);
  const optionalArtifacts = buildOptionalArtifactsInfo(docsRoot);
  const modesArtifact = optionalArtifacts.find((artifact) => artifact.fileName === "a11y.modes.md") || {
    fileName: "a11y.modes.md",
    exists: false,
    relativeLink: "../_generated/a11y.modes.md",
  };

  const maxSamplesClamped = Math.max(1, maxSamples);

  const pageBuilders = [
    () => buildColorPage({
      entries,
      cssVarIndex,
      status,
      optionalArtifacts,
      maxSamples: maxSamplesClamped,
    }),
    () => buildTypographyPage({
      entries,
      cssVarIndex,
      status,
      maxSamples: maxSamplesClamped,
    }),
    () => buildSpacingSizingPage({
      entries,
      cssVarIndex,
      status,
      maxSamples: maxSamplesClamped,
    }),
    () => buildElevationPage({
      entries,
      cssVarIndex,
      status,
      maxSamples: maxSamplesClamped,
    }),
    () => buildIconographyPage({
      entries,
      cssVarIndex,
      status,
      maxSamples: maxSamplesClamped,
    }),
    () => buildA11yPage({
      entries,
      cssVarIndex,
      status,
      optionalModesArtifact: modesArtifact,
      maxSamples: maxSamplesClamped,
    }),
  ];

  const pages = pageBuilders.map((builder) => builder());
  const overview = buildOverviewPage({
    status,
    pages: pages.map((page) => ({
      title: page.title,
      fileName: page.fileName,
    })),
  });

  const foundationsRootExistedAtStart = fs.existsSync(foundationsRoot);
  if (!dryRun && !fs.existsSync(foundationsRoot) && createRoot) {
    fs.mkdirSync(foundationsRoot, { recursive: true });
  }

  const changedFiles = [];
  const gapSummary = {};

  for (const page of pages) {
    const outputPath = path.join(foundationsRoot, page.fileName);
    const changed = writeFileIfChanged(outputPath, page.content, dryRun);
    if (changed) changedFiles.push(outputPath);
    gapSummary[page.fileName] = Array.isArray(page.gaps) ? page.gaps.length : 0;
  }

  const overviewPath = path.join(foundationsRoot, overview.fileName);
  const overviewChanged = writeFileIfChanged(overviewPath, overview.content, dryRun);
  if (overviewChanged) changedFiles.push(overviewPath);

  const report = {
    ok: true,
    dryRun,
    createdRoot: createRoot && !dryRun && !foundationsRootExistedAtStart,
    docsRoot,
    foundationsRoot,
    registryPath,
    pages: pages.map((page) => page.fileName),
    changedFiles,
    changedCount: changedFiles.length,
    gapSummary,
    hint:
      changedFiles.length > 0
        ? "Run `npm run validate:docs` to validate generated foundations pages."
        : "No content changes detected.",
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main();
