function parseBooleanOption(rawValue, optionName, fallback = false) {
  const normalized = String(rawValue ?? fallback).trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error(`Invalid ${optionName} value: ${rawValue}. Allowed: true, false.`);
}

function parsePositiveNumber(rawValue, optionName, fallback) {
  const parsed = Number(rawValue ?? fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `Invalid ${optionName} value: ${rawValue}. Expected a positive number.`,
    );
  }
  return parsed;
}

function parseComponentKind(rawValue) {
  const normalized = String(rawValue || "component_set").trim().toLowerCase();
  if (normalized === "component_set" || normalized === "component" || normalized === "all") {
    return normalized;
  }
  throw new Error(
    `Invalid --component-kind value: ${rawValue}. Allowed: component_set, component, all.`,
  );
}

function parseMainCaptureMode(rawValue) {
  const normalized = String(rawValue || "rest").trim().toLowerCase();
  if (normalized === "auto" || normalized === "agent" || normalized === "rest") {
    return normalized;
  }
  throw new Error(
    `Invalid --main-capture-mode value: ${rawValue}. Allowed: auto, agent, rest.`,
  );
}

export function parsePipelineOptions(args) {
  const rawSlug = String(args["component-slug"] || "").trim().toLowerCase();
  const componentSlugOverride = rawSlug.replace(/[\\/]/g, "-").replace(/\.\./g, "");

  return {
    componentSlugOverride,
    componentKind: parseComponentKind(args["component-kind"]),
    includeVariants: parseBooleanOption(args["include-variants"], "--include-variants", true),
    requireExistingDoc: parseBooleanOption(args["require-existing-doc"], "--require-existing-doc", true),
    continueOnError: parseBooleanOption(args["continue-on-error"], "--continue-on-error", true),
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
