import {
  parseBooleanOption,
  parseComponentKind,
  parseMainCaptureMode,
  parsePositiveNumber,
} from "./capture-options.mjs";

export function parsePipelineOptions(args) {
  const rawSlug = String(args["component-slug"] || "").trim().toLowerCase();
  const componentSlugOverride = rawSlug.replace(/[\\/]/g, "-").replace(/\.\./g, "");

  return {
    componentSlugOverride,
    componentKind: parseComponentKind(args["component-kind"]),
    includeVariants: parseBooleanOption(args["include-variants"], "--include-variants", true),
    requireExistingDoc: parseBooleanOption(args["require-existing-doc"], "--require-existing-doc", true),
    continueOnError: parseBooleanOption(args["continue-on-error"], "--continue-on-error", true),
    refreshIndices: parseBooleanOption(args["refresh-indices"], "--refresh-indices", true),
    dryRun: parseBooleanOption(args["dry-run"], "--dry-run", false),
    injectDocSpecs: parseBooleanOption(args["inject-doc-specs"], "--inject-doc-specs", false),
    includeSpecExhibits: parseBooleanOption(args["include-spec-exhibits"], "--include-spec-exhibits", true),
    variantLimit: Math.floor(parsePositiveNumber(args["variant-limit"], "--variant-limit", 6)),
    scale: parsePositiveNumber(args.scale, "--scale", 2),
    format: String(args.format || "png").trim().toLowerCase(),
    agent: String(args.agent || "auto").trim(),
    mainCaptureMode: parseMainCaptureMode(args["main-capture-mode"]),
    force: String(args.force || "false") === "true",
    skipValidation: String(args["skip-validation"] || "false") === "true",
    allowNonEvidenceUpdates: String(args["allow-non-evidence-updates"] || "false") === "true",
  };
}
