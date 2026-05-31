type FigmaUrlParts = {
  fileKey: string;
  slug: string;
};

function parseFigmaUrlParts(rawUrl: string): FigmaUrlParts {
  const value = String(rawUrl || "").trim();
  if (!value) return { fileKey: "", slug: "" };

  try {
    const parsed = new URL(value);
    const segments = parsed.pathname.split("/").filter(Boolean);
    for (let i = 0; i < segments.length - 1; i += 1) {
      if (segments[i] === "file" || segments[i] === "design") {
        return {
          fileKey: segments[i + 1] || "",
          slug: segments[i + 2] || "",
        };
      }
    }
  } catch {
    return { fileKey: "", slug: "" };
  }

  return { fileKey: "", slug: "" };
}

function humanizeFigmaSlug(rawSlug: string): string {
  return String(rawSlug || "")
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b([a-z])/g, (match) => match.toUpperCase());
}

export function suggestNameFromFigmaUrl(rawUrl: string): string {
  const { fileKey, slug } = parseFigmaUrlParts(rawUrl);
  return fileKey ? humanizeFigmaSlug(slug) : "";
}
