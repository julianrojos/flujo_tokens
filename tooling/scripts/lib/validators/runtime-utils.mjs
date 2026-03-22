import fs from "node:fs";
import path from "node:path";

export function buildLineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

export function lineFromOffset(lineStarts, offset) {
  let left = 0;
  let right = lineStarts.length - 1;
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const start = lineStarts[mid];
    const nextStart =
      mid + 1 < lineStarts.length
        ? lineStarts[mid + 1]
        : Number.MAX_SAFE_INTEGER;
    if (offset >= start && offset < nextStart) return mid + 1;
    if (offset < start) right = mid - 1;
    else left = mid + 1;
  }
  return 1;
}

export function collectMarkdownFiles(docsRoot, explicitFilePath) {
  if (explicitFilePath) return [path.resolve(explicitFilePath)];
  if (!fs.existsSync(docsRoot)) return [];
  const files = [];
  const queue = [path.resolve(docsRoot)];

  while (queue.length > 0) {
    const currentDir = queue.shift();
    if (!currentDir) break;
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        queue.push(absolutePath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(absolutePath);
      }
    }
  }

  return files.sort((a, b) =>
    a.localeCompare(b, "en", { sensitivity: "base" }),
  );
}

export function collectSpecFiles(specRoot) {
  if (!fs.existsSync(specRoot)) return [];
  return fs
    .readdirSync(specRoot, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(".yml") &&
        entry.name !== "_template.yml",
    )
    .map((entry) => path.join(specRoot, entry.name))
    .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}
