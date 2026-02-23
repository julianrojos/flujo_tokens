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
