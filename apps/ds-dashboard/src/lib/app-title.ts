export const APP_TITLE = "DS Graph";

export function buildDocumentTitleFromBreadcrumbs(labels: string[]): string {
  const crumbs = labels
    .map((label) => String(label || "").trim())
    .filter(Boolean);
  if (crumbs.length === 0) return APP_TITLE;
  return `${crumbs.join(" / ")} · ${APP_TITLE}`;
}
