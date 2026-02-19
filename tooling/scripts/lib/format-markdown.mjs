import fs from "node:fs";
import path from "node:path";
import { runOrThrow } from "./exec.mjs";

export function formatMarkdownTarget(targetPath) {
  const resolvedTarget = path.resolve(String(targetPath || ""));
  if (!resolvedTarget || !fs.existsSync(resolvedTarget)) {
    throw new Error(`Markdown file not found for formatting: ${resolvedTarget}`);
  }
  runOrThrow("npx", ["prettier", "--write", resolvedTarget]);
}

export function formatMarkdownScope({ outputPath, docsRoot }) {
  let target;
  if (outputPath) {
    target = path.resolve(String(outputPath));
    if (!fs.existsSync(target)) {
      throw new Error(`Markdown file not found for formatting: ${target}`);
    }
  } else {
    const resolvedDocsRoot = path.resolve(String(docsRoot || ""));
    if (!resolvedDocsRoot || !fs.existsSync(resolvedDocsRoot)) {
      throw new Error(
        `Markdown docs root not found for formatting: ${resolvedDocsRoot}`,
      );
    }
    target = path.join(resolvedDocsRoot, "**/*.md");
  }
  runOrThrow("npx", ["prettier", "--write", target]);
}
