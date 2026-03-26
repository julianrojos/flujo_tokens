function buildFailure(status, code, userMessage, context) {
  return {
    error: {
      status,
      payload: {
        code,
        userMessage,
        recoverable: true,
        context,
      },
    },
  };
}

function cloneSystems(config) {
  return Array.isArray(config?.systems) ? [...config.systems] : [];
}

const CANONICAL_SYSTEMS_PREFIX = "design-systems";

/**
 * Validates that systemId contains only safe characters.
 * Returns true if valid, false otherwise.
 */
function isValidSystemId(systemId) {
  return typeof systemId === "string" && /^[a-z0-9_-]+$/.test(systemId);
}

function getDefaultSystemDirs(systemId) {
  if (!isValidSystemId(systemId)) {
    throw new Error(`Invalid systemId: "${systemId}". Only alphanumeric characters, hyphens, and underscores are allowed.`);
  }
  const canonicalBase = `${CANONICAL_SYSTEMS_PREFIX}/${systemId}`;
  return {
    inputDir: `${canonicalBase}/input`,
    outputDir: `${canonicalBase}/output`,
    docsDir: `${canonicalBase}/docs`,
  };
}

export function buildCreateDesignSystemConfigMutation({
  config,
  body,
  normalizeSystemId,
  ensureRelativeDir,
  normalizeFigmaApiTokenRef,
  normalizeCollectionList,
}) {
  const systemId = normalizeSystemId(body.id);
  const systemName = String(body.name || "").trim();
  if (!systemId || !systemName) {
    return buildFailure(400, "validation.missing_required_fields", "Both `id` and `name` are required.", {
      required: ["id", "name"],
    });
  }

  const currentSystems = cloneSystems(config);
  const exists = currentSystems.some((row) => String(row?.id || "").trim() === systemId);
  if (exists) {
    return buildFailure(409, "design_system.already_exists", `System '${systemId}' already exists.`, {
      systemId,
    });
  }

  const defaultDirs = getDefaultSystemDirs(systemId);
  const inputDir = ensureRelativeDir(body.inputDir, defaultDirs.inputDir);
  const outputDir = ensureRelativeDir(body.outputDir, defaultDirs.outputDir);
  const docsDir = ensureRelativeDir(body.docsDir, defaultDirs.docsDir);

  const nextSystem = {
    id: systemId,
    name: systemName,
    appName: String(body.appName || "").trim() || systemName,
    figmaFileId: String(body.figmaFileId || "").trim(),
    figmaApiToken: normalizeFigmaApiTokenRef(
      body.figmaApiToken,
      `FIGMA_TOKEN_${systemId.toUpperCase().replace(/-/g, "_")}`,
    ),
    inputDir,
    outputDir,
    docsDir,
    collections: normalizeCollectionList(body.collections),
    compileVariablesOnCapture: body.compileVariablesOnCapture !== false,
  };

  const nextConfig = {
    ...config,
    systems: [...currentSystems, nextSystem],
    defaultSystem:
      body.makeDefault === true ? systemId : String(config?.defaultSystem || "") || systemId,
  };

  return {
    nextSystem,
    nextConfig,
  };
}

export function buildUpdateDesignSystemConfigMutation({
  config,
  routeSystemId,
  body,
  ensureRelativeDir,
  normalizeFigmaApiTokenRef,
  normalizeCollectionList,
}) {
  const nextSystems = cloneSystems(config);
  const targetIndex = nextSystems.findIndex(
    (row) => String(row?.id || "").trim() === routeSystemId,
  );
  if (targetIndex < 0) {
    return buildFailure(404, "design_system.not_found", `System '${routeSystemId}' not found.`, {
      systemId: routeSystemId,
    });
  }

  const current = nextSystems[targetIndex] || {};
  const normalizedName = String(body.name ?? current.name ?? "").trim();
  if (!normalizedName) {
    return buildFailure(400, "validation.invalid_name", "System name cannot be empty.", {
      field: "name",
    });
  }

  const defaultDirs = getDefaultSystemDirs(routeSystemId);
  const updated = {
    ...current,
    id: routeSystemId,
    name: normalizedName,
    appName: String(body.appName ?? current.appName ?? normalizedName).trim() || normalizedName,
    figmaFileId: String(body.figmaFileId ?? current.figmaFileId ?? "").trim(),
    figmaApiToken: normalizeFigmaApiTokenRef(body.figmaApiToken ?? current.figmaApiToken),
    inputDir: ensureRelativeDir(body.inputDir ?? current.inputDir, defaultDirs.inputDir),
    outputDir: ensureRelativeDir(body.outputDir ?? current.outputDir, defaultDirs.outputDir),
    docsDir: ensureRelativeDir(body.docsDir ?? current.docsDir, defaultDirs.docsDir),
    collections: normalizeCollectionList(body.collections ?? current.collections ?? []),
    compileVariablesOnCapture:
      body.compileVariablesOnCapture !== undefined
        ? body.compileVariablesOnCapture === true
        : current.compileVariablesOnCapture !== false,
  };

  nextSystems[targetIndex] = updated;
  const nextConfig = {
    ...config,
    systems: nextSystems,
    defaultSystem:
      body.makeDefault === true
        ? routeSystemId
        : String(config?.defaultSystem || "") || routeSystemId,
  };

  return {
    updated,
    nextConfig,
  };
}

export function buildDeleteDesignSystemConfigMutation({ config, routeSystemId }) {
  const currentSystems = cloneSystems(config);
  const targetSystem = currentSystems.find(
    (row) => String(row?.id || "").trim() === routeSystemId,
  );
  const nextSystems = currentSystems.filter(
    (row) => String(row?.id || "").trim() !== routeSystemId,
  );

  if (nextSystems.length === currentSystems.length) {
    return buildFailure(404, "design_system.not_found", `System '${routeSystemId}' not found.`, {
      systemId: routeSystemId,
    });
  }

  const configuredDefault = String(config.defaultSystem || "");
  const hasConfiguredDefault = nextSystems.some(
    (row) => String(row?.id || "").trim() === configuredDefault,
  );
  const nextDefault =
    nextSystems.length === 0
      ? ""
      : configuredDefault === routeSystemId || !hasConfiguredDefault
        ? String(nextSystems[0]?.id || "")
        : configuredDefault;

  return {
    targetSystem,
    nextSystems,
    nextConfig: {
      ...config,
      systems: nextSystems,
      defaultSystem: nextDefault,
    },
  };
}
