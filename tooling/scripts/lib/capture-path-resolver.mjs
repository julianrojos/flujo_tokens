import path from "node:path";

export function resolveDocsPaths({ ctx, docsRootOverride, slug }) {
  const docsRoot = docsRootOverride || ctx.paths.docs;
  const docsRootResolved = path.resolve(docsRoot);

  const componentDocsDir =
    path.basename(docsRootResolved) === "components"
      ? docsRootResolved
      : path.join(docsRootResolved, "components");

  const docsRootDir =
    path.basename(docsRootResolved) === "components"
      ? path.dirname(docsRootResolved)
      : docsRootResolved;

  return {
    docsRootDir,
    componentDocsDir,
    markdownPath: path.join(componentDocsDir, `${slug}.md`),
    specPath: path.join(docsRootDir, "_spec", "components", `${slug}.yml`),
  };
}
