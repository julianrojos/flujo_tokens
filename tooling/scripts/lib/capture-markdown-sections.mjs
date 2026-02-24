import { buildEnrichedMarkdownSections } from "./figma-node-spec-extractor.mjs";

function escapeRegex(rawValue) {
  return String(rawValue || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceH2Section(markdown, heading, replacementBody) {
  const normalizedBody = String(replacementBody || "").trimEnd();
  const headingRegex = new RegExp(`^##\\s+${escapeRegex(heading)}\\s*$`, "m");
  const headingMatch = headingRegex.exec(markdown);
  if (!headingMatch) {
    return { changed: false, content: markdown };
  }

  const sectionStart = headingMatch.index;
  const headingLineEnd = markdown.indexOf("\n", sectionStart);
  const hasTrailingNewline = headingLineEnd >= 0;
  const headingLine = hasTrailingNewline
    ? markdown.slice(sectionStart, headingLineEnd + 1)
    : `${markdown.slice(sectionStart)}\n`;

  const bodyStart = hasTrailingNewline ? headingLineEnd + 1 : markdown.length;
  const tail = markdown.slice(bodyStart);
  const nextHeadingMatch = /^##\s+[^\n]+\s*$/m.exec(tail);
  const sectionEnd =
    nextHeadingMatch && Number.isFinite(nextHeadingMatch.index)
      ? bodyStart + nextHeadingMatch.index
      : markdown.length;

  const before = markdown.slice(0, sectionStart);
  const after = markdown.slice(sectionEnd).replace(/^\n*/, "\n");
  const replacement = `${headingLine}\n${normalizedBody}\n\n`;
  const next = `${before}${replacement}${after}`;
  return { changed: next !== markdown, content: next };
}

function buildSpecExhibitMarkdown(label, exhibit) {
  const imageUrl = String(exhibit?.imageUrl || "").trim();
  const nodeId = String(exhibit?.nodeId || "").trim();
  if (!imageUrl && !nodeId) return "";
  const lines = [`### ${label} exhibit`];
  if (imageUrl) {
    lines.push("", `![${label} exhibit](${imageUrl})`);
  }
  if (nodeId) {
    lines.push("", `- Source node: \`${nodeId}\``);
  }
  return lines.join("\n");
}

function appendSpecExhibit(sectionBody, label, exhibit) {
  const normalized = String(sectionBody || "").trimEnd();
  const exhibitBlock = buildSpecExhibitMarkdown(label, exhibit);
  if (!exhibitBlock) return normalized;
  if (!normalized) return exhibitBlock;
  return `${normalized}\n\n${exhibitBlock}`;
}

export function injectExtractedSpecSectionsIntoMarkdown(markdown, spec, exhibits = null) {
  if (!spec || typeof spec !== "object") {
    return { changed: false, content: markdown };
  }

  const sections = buildEnrichedMarkdownSections(spec);
  const anatomyBody = appendSpecExhibit(
    sections.anatomy,
    "Anatomy",
    exhibits?.anatomy || null,
  );
  const componentApiBody = appendSpecExhibit(
    sections.componentApi,
    "Properties",
    exhibits?.properties || null,
  );
  const visualSpecsBody = appendSpecExhibit(
    sections.visualSpecifications,
    "Layout and spacing",
    exhibits?.layout || null,
  );
  let current = markdown;
  let changed = false;

  const anatomyResult = replaceH2Section(current, "Anatomy", anatomyBody);
  current = anatomyResult.content;
  changed = changed || anatomyResult.changed;

  const apiResult = replaceH2Section(current, "Component API", componentApiBody);
  current = apiResult.content;
  changed = changed || apiResult.changed;

  const visualResult = replaceH2Section(
    current,
    "Visual Specifications",
    visualSpecsBody,
  );
  current = visualResult.content;
  changed = changed || visualResult.changed;

  return { changed, content: current };
}
