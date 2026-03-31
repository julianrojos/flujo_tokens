import path from "node:path";

export function resolvePipelinePaths(args, systemContext) {
  const docsRootOverride = args["docs-root"] ? String(args["docs-root"]).trim() : null;
  const docsRootInput = docsRootOverride || systemContext.paths.docs;
  const docsRootResolved = path.resolve(docsRootInput);
  
  // ASSUMPTION: docsRootResolved points to the actual docs root directory,
  // OR explicitly to the "components" directory. 
  // If it's explicitly resolving to "components", we climb up one level.
  const isComponentsDir = path.basename(docsRootResolved) === "components";
  
  const docsRootDir = isComponentsDir
    ? path.dirname(docsRootResolved)
    : docsRootResolved;
  
  const componentDocsDir = isComponentsDir
    ? docsRootResolved
    : path.join(docsRootResolved, "components");

  const proofDir = path.resolve(args["proof-dir"] || path.join(systemContext.paths.generated, "visual-proofs"));
  const proofImageDir = path.resolve(
    args["proof-image-dir"] || path.join(systemContext.paths.generated, "visual-proofs", "images"),
  );

  const specRoot = args["spec-root"] || systemContext.paths.specs || path.join(docsRootDir, "_spec", "components");
  const resolvedSpecRoot = path.resolve(specRoot);

  return {
    docsRootOverride,
    docsRootDir,
    componentDocsDir,
    proofDir,
    proofImageDir,
    registryDbPath: path.resolve(systemContext.paths.registry),
    tokenRegistryPath: path.resolve(args.registry || systemContext.paths.tokenRegistry || path.join(docsRootDir, "_generated", "token-registry.json")),
    resolvedSpecRoot,
    templatePath: path.resolve(args.template || path.join(resolvedSpecRoot, "_template.yml")),
    overviewPath: path.resolve(path.join(docsRootDir, "overview.md")),
  };
}
