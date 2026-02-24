import path from "node:path";
import fs from "node:fs";
import { runJsonCommand } from "./exec.mjs";
import { fetchFigmaFile, fetchFigmaImages, fetchFigmaNodes } from "./figma-api.mjs";
import { writeTextAtomic, buildMarkdownSeed } from "./capture-doc-scaffold.mjs";
import { renderEnrichedMarkdownSeed, extractComponentSpec } from "./figma-node-spec-extractor.mjs";
import { injectExtractedSpecSectionsIntoMarkdown } from "./capture-markdown-sections.mjs";

export function createCaptureServices({ context }) {
  return {
    readComponentRegistry: () => {
      const p = context.paths.registryIndexPath;
      if (!fs.existsSync(p)) return [];
      try {
        const parsed = JSON.parse(fs.readFileSync(p, "utf8"));
        return Array.isArray(parsed?.components) ? parsed.components : [];
      } catch {
        return [];
      }
    },
    readSpecContents: () => {
      const dir = context.paths.resolvedSpecRoot;
      if (!fs.existsSync(dir)) return [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      return entries
        .filter((e) => e.isFile() && e.name.endsWith(".yml") && e.name !== "_template.yml")
        .map((e) => ({
          slug: path.basename(e.name, ".yml"),
          content: fs.readFileSync(path.join(dir, e.name), "utf8"),
        }));
    },
    readMarkdownContent: (p) => fs.readFileSync(p, "utf8"),
    markdownExists: (p) => fs.existsSync(p),
    specExists: (p) => fs.existsSync(p),
    runScriptJson: (params) => {
      const scriptArgsList = Array.isArray(params.scriptArgs) ? [...params.scriptArgs] : [];
      const displayArgs = [...scriptArgsList];
      const tokenArgIndex = displayArgs.indexOf("--figma-token");
      if (tokenArgIndex >= 0 && tokenArgIndex + 1 < displayArgs.length) {
        displayArgs[tokenArgIndex + 1] = "***redacted***";
      }

      const result = runJsonCommand(process.execPath, [params.scriptPath, ...scriptArgsList], {
        cwd: context.repoRoot,
        displayArgs: [path.relative(context.repoRoot, params.scriptPath), ...displayArgs],
      });
      return result.data;
    },
    fetchFigmaFile: fetchFigmaFile,
    fetchFigmaNodes: fetchFigmaNodes,
    fetchFigmaImages: fetchFigmaImages,
    writeTextAtomic: writeTextAtomic,
    stderrWrite: (message) => process.stderr.write(message),
    renderEnrichedMarkdownSeed,
    injectExtractedSpecSectionsIntoMarkdown,
    buildMarkdownSeed,
    extractComponentSpec,
  };
}
