function escapeRegex(source) {
  return String(source || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractSectionBody(rawMarkdown, headingTitle) {
  const markdown = String(rawMarkdown || "");
  const escaped = escapeRegex(headingTitle);
  const headingRegex = new RegExp(`^##\\s+${escaped}\\s*$`, "m");
  const headingMatch = headingRegex.exec(markdown);
  if (!headingMatch) return "";

  const start = headingMatch.index;
  const headingEnd = markdown.indexOf("\n", start);
  const contentStart = headingEnd === -1 ? markdown.length : headingEnd + 1;
  const rest = markdown.slice(contentStart);
  const nextHeadingMatch = /^##\s+/m.exec(rest);
  const end = nextHeadingMatch
    ? contentStart + nextHeadingMatch.index
    : markdown.length;
  return markdown.slice(contentStart, end).trim();
}
