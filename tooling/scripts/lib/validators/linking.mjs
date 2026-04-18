import fs from "node:fs";
import path from "node:path";

const CANONICAL_COMPONENT_LIST_HEADING = "component list";
const OVERVIEW_ENTRY_RE = /^-\s+\[([^\]]+)\]\(([^)]+)\)\s*$/;
const OVERVIEW_TARGET_RE = /^[a-z0-9]+(?:_[a-z0-9]+)*\.md$/;

export function validateOverviewLinks({
  docsRoot,
  componentFiles,
  report,
  buildLineStarts,
  lineFromOffset,
  normalizeHeadingText,
}) {
  const overviewPath = path.join(docsRoot, "overview.md");
  if (!fs.existsSync(overviewPath)) {
    report.errors.push({
      code: "LINK01",
      file: overviewPath,
      message: "Missing components overview page.",
    });
    return;
  }

  const overviewRaw = fs.readFileSync(overviewPath, "utf8");
  const lineStarts = buildLineStarts(overviewRaw);
  const content = overviewRaw;
  const contentOffset = 0;

  const headingRegex = /^##\s+(.+?)\s*$/gim;
  let headingMatch;
  let sectionStart = -1;
  let sectionEnd = content.length;

  while ((headingMatch = headingRegex.exec(content)) !== null) {
    const headingText = normalizeHeadingText(headingMatch[1]);
    if (sectionStart >= 0) {
      sectionEnd = headingMatch.index;
      break;
    }
    if (headingText === CANONICAL_COMPONENT_LIST_HEADING) {
      sectionStart = headingMatch.index + headingMatch[0].length;
    }
  }

  if (sectionStart < 0) {
    report.errors.push({
      code: "LINK02",
      file: overviewPath,
      message: "Missing `## Component list` section in overview.",
    });
    return;
  }

  const sectionText = content.slice(sectionStart, sectionEnd);
  const sectionBaseOffset = contentOffset + sectionStart;
  const sectionLines = sectionText.split("\n");
  const entries = [];

  for (let i = 0, offset = 0; i < sectionLines.length; i += 1) {
    const line = sectionLines[i];
    const trimmed = String(line || "").trim();
    const lineOffset = sectionBaseOffset + offset;
    offset += line.length + 1;

    if (!trimmed) continue;
    if (!trimmed.startsWith("-")) continue;

    const parsed = trimmed.match(OVERVIEW_ENTRY_RE);
    if (!parsed) {
      report.errors.push({
        code: "LINK02",
        file: overviewPath,
        line: lineFromOffset(lineStarts, lineOffset),
        message:
          "Component list entries must use `- [Display Name](snake_case.md)` format.",
      });
      continue;
    }

    const displayName = String(parsed[1] || "")
      .trim()
      .replace(/\s+/g, " ");
    const target = String(parsed[2] || "").trim();

    if (!displayName) {
      report.errors.push({
        code: "LINK02",
        file: overviewPath,
        line: lineFromOffset(lineStarts, lineOffset),
        message: "Component list entry has an empty display name.",
      });
      continue;
    }

    if (!OVERVIEW_TARGET_RE.test(target)) {
      report.errors.push({
        code: "LINK02",
        file: overviewPath,
        line: lineFromOffset(lineStarts, lineOffset),
        message: `Component list link target must be snake_case.md: \`${target}\`.`,
      });
      continue;
    }

    entries.push({
      displayName,
      target,
      absolutePath: path.resolve(path.dirname(overviewPath), target),
      line: lineFromOffset(lineStarts, lineOffset),
    });
  }

  if (entries.length === 0) {
    report.errors.push({
      code: "LINK02",
      file: overviewPath,
      message: "Component list section has no valid entries.",
    });
    return;
  }

  const seenDisplay = new Map();
  const seenTarget = new Map();
  for (const entry of entries) {
    const displayKey = entry.displayName.toLowerCase();
    if (seenDisplay.has(displayKey)) {
      report.errors.push({
        code: "LINK02",
        file: overviewPath,
        line: entry.line,
        message: `Duplicate display name in component list: \`${entry.displayName}\`.`,
      });
    } else {
      seenDisplay.set(displayKey, entry.line);
    }

    const targetKey = entry.target.toLowerCase();
    if (seenTarget.has(targetKey)) {
      report.errors.push({
        code: "LINK02",
        file: overviewPath,
        line: entry.line,
        message: `Duplicate component link in component list: \`${entry.target}\`.`,
      });
    } else {
      seenTarget.set(targetKey, entry.line);
    }
  }

  const normalizedName = (value) =>
    String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  const sortedEntries = entries.slice().sort((a, b) => {
    const aName = normalizedName(a.displayName);
    const bName = normalizedName(b.displayName);
    if (aName !== bName) return aName.localeCompare(bName, "en");
    return a.target.toLowerCase().localeCompare(b.target.toLowerCase(), "en");
  });

  for (let i = 0; i < entries.length; i += 1) {
    const current = entries[i];
    const expected = sortedEntries[i];
    if (
      current.displayName === expected.displayName &&
      current.target === expected.target
    )
      continue;
    report.errors.push({
      code: "LINK02",
      file: overviewPath,
      line: current.line,
      message:
        "Component list must be alphabetically sorted by display name (case-insensitive), " +
        "with filename tie-breaker.",
    });
    break;
  }

  const linkedSet = new Set(entries.map((entry) => entry.absolutePath));
  const componentSet = new Set(componentFiles);

  for (const entry of entries) {
    if (!fs.existsSync(entry.absolutePath)) {
      report.errors.push({
        code: "LINK01",
        file: overviewPath,
        line: entry.line,
        message: `Overview link points to missing file: ${path.relative(process.cwd(), entry.absolutePath)}.`,
      });
    }
  }

  for (const componentFile of componentSet) {
    if (!linkedSet.has(componentFile)) {
      report.errors.push({
        code: "LINK01",
        file: overviewPath,
        message: `Orphan component doc not listed in overview: ${path.relative(process.cwd(), componentFile)}.`,
      });
    }
  }
}

export function validateSpecMarkdownPairing({
  componentFiles,
  docsRoot,
  specRoot,
  checkSpecs,
  explicitSpecFilePath,
  explicitFilePath,
  report,
  collectSpecFiles,
}) {
  const componentSet = new Set(
    componentFiles.map((filePath) => path.resolve(filePath)),
  );
  const explicitPairMode = Boolean(explicitFilePath && explicitSpecFilePath);
  const resolvedExplicitFilePath = explicitFilePath
    ? path.resolve(explicitFilePath)
    : "";
  const resolvedExplicitSpecFilePath = explicitSpecFilePath
    ? path.resolve(explicitSpecFilePath)
    : "";

  for (const componentFile of componentFiles) {
    if (
      explicitPairMode &&
      path.resolve(componentFile) === resolvedExplicitFilePath
    ) {
      if (fs.existsSync(resolvedExplicitSpecFilePath)) continue;
      report.errors.push({
        code: "PAIR01",
        file: componentFile,
        message:
          "Component markdown must have a matching spec YAML file: " +
          `${path.relative(process.cwd(), resolvedExplicitSpecFilePath)}.`,
      });
      continue;
    }

    const slug = path.basename(componentFile, path.extname(componentFile));
    const expectedSpecPath = path.resolve(specRoot, `${slug}.yml`);
    if (fs.existsSync(expectedSpecPath)) continue;
    report.errors.push({
      code: "PAIR01",
      file: componentFile,
      message:
        "Component markdown must have a matching spec YAML file: " +
        `${path.relative(process.cwd(), expectedSpecPath)}.`,
    });
  }

  const specFilesForPairing = explicitSpecFilePath
    ? [path.resolve(explicitSpecFilePath)]
    : checkSpecs
      ? collectSpecFiles(specRoot)
      : [];

  for (const specFile of specFilesForPairing) {
    if (
      explicitPairMode &&
      path.resolve(specFile) === resolvedExplicitSpecFilePath
    ) {
      const expectedMarkdownPath = resolvedExplicitFilePath;
      if (
        componentSet.has(expectedMarkdownPath) ||
        fs.existsSync(expectedMarkdownPath)
      )
        continue;
      report.errors.push({
        code: "PAIR01",
        file: specFile,
        message:
          "Component spec YAML must have a matching markdown file: " +
          `${path.relative(process.cwd(), expectedMarkdownPath)}.`,
      });
      continue;
    }

    const slug = path.basename(specFile, path.extname(specFile));
    const expectedMarkdownPath = path.resolve(docsRoot, `${slug}.md`);
    if (
      componentSet.has(expectedMarkdownPath) ||
      fs.existsSync(expectedMarkdownPath)
    )
      continue;
    report.errors.push({
      code: "PAIR01",
      file: specFile,
      message:
        "Component spec YAML must have a matching markdown file: " +
        `${path.relative(process.cwd(), expectedMarkdownPath)}.`,
    });
  }
}
