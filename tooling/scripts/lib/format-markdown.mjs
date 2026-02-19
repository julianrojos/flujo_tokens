import path from "node:path";
import { runOrThrow } from "./exec.mjs";

export function formatMarkdownTarget(targetPath) {
  runOrThrow("npx", ["prettier", "--write", path.resolve(targetPath)]);
}

export function formatMarkdownScope({ outputPath, docsRoot }) {
  const target = outputPath
    ? path.resolve(outputPath)
    : path.join(path.resolve(docsRoot), "**/*.md");
  runOrThrow("npx", ["prettier", "--write", target]);
}
