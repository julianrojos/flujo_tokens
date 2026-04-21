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

function normalizeReadonlyCollections(value) {
  if (!Array.isArray(value)) return [];
  // Keep case-sensitive values; normalize only order/duplicates for read-only equality checks.
  return Array.from(
    new Set(
      value
        .map((item) => String(item ?? "").trim())
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right, "en", { sensitivity: "variant" }));
}

function areStringArraysEqual(left, right) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function normalizeImportComponentNames(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry ?? "").trim())
    .filter(Boolean);
}

function normalizeImportCount(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return fallback;
  return Math.floor(numeric);
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
      "FIGMA_TOKEN",
    ),
    inputDir,
    outputDir,
    docsDir,
    collections: normalizeCollectionList(body.collections),
    compileVariablesOnCapture: body.compileVariablesOnCapture !== false,
    detectedComponentsCount: normalizeImportCount(body.detectedComponentsCount, null),
    importedComponentsCount: normalizeImportCount(body.importedComponentsCount, null),
    pendingComponentsCount: normalizeImportCount(body.pendingComponentsCount, null),
    importedComponentNames: normalizeImportComponentNames(body.importedComponentNames),
    pendingComponentNames: normalizeImportComponentNames(body.pendingComponentNames),
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
  const defaultDirs = getDefaultSystemDirs(routeSystemId);
  const readOnlyFieldChanges = [];
  if (Object.prototype.hasOwnProperty.call(body || {}, "figmaFileId")) {
    const incoming = String(body.figmaFileId ?? "").trim();
    const existing = String(current.figmaFileId ?? "").trim();
    if (incoming !== existing) readOnlyFieldChanges.push("figmaFileId");
  }
  if (Object.prototype.hasOwnProperty.call(body || {}, "figmaApiToken")) {
    const incoming = String(body.figmaApiToken ?? "").trim();
    const existing = String(current.figmaApiToken ?? "").trim();
    if (incoming !== existing) readOnlyFieldChanges.push("figmaApiToken");
  }
  if (Object.prototype.hasOwnProperty.call(body || {}, "collections")) {
    const incoming = normalizeReadonlyCollections(body.collections);
    const existing = normalizeReadonlyCollections(current.collections);
    if (!areStringArraysEqual(incoming, existing)) readOnlyFieldChanges.push("collections");
  }
  if (Object.prototype.hasOwnProperty.call(body || {}, "inputDir")) {
    const incoming = ensureRelativeDir(body.inputDir, defaultDirs.inputDir);
    const existing = ensureRelativeDir(current.inputDir, defaultDirs.inputDir);
    if (incoming !== existing) readOnlyFieldChanges.push("inputDir");
  }
  if (Object.prototype.hasOwnProperty.call(body || {}, "outputDir")) {
    const incoming = ensureRelativeDir(body.outputDir, defaultDirs.outputDir);
    const existing = ensureRelativeDir(current.outputDir, defaultDirs.outputDir);
    if (incoming !== existing) readOnlyFieldChanges.push("outputDir");
  }
  if (Object.prototype.hasOwnProperty.call(body || {}, "docsDir")) {
    const incoming = ensureRelativeDir(body.docsDir, defaultDirs.docsDir);
    const existing = ensureRelativeDir(current.docsDir, defaultDirs.docsDir);
    if (incoming !== existing) readOnlyFieldChanges.push("docsDir");
  }
  if (readOnlyFieldChanges.length > 0) {
    return buildFailure(
      400,
      "validation.read_only_fields",
      "Some fields are read-only and cannot be updated.",
      { fields: readOnlyFieldChanges },
    );
  }

  const normalizedName = String(body.name ?? current.name ?? "").trim();
  if (!normalizedName) {
    return buildFailure(400, "validation.invalid_name", "System name cannot be empty.", {
      field: "name",
    });
  }

  const updated = {
    ...current,
    id: routeSystemId,
    name: normalizedName,
    appName: String(body.appName ?? current.appName ?? normalizedName).trim() || normalizedName,
    // Immutable via update route: managed by create/bootstrap flows, not admin UI edits.
    // This includes Figma identity fields and collection scope.
    figmaFileId: String(current.figmaFileId ?? "").trim(),
    figmaApiToken: String(current.figmaApiToken ?? "").trim(),
    inputDir: ensureRelativeDir(current.inputDir, defaultDirs.inputDir),
    outputDir: ensureRelativeDir(current.outputDir, defaultDirs.outputDir),
    docsDir: ensureRelativeDir(current.docsDir, defaultDirs.docsDir),
    collections: Array.isArray(current.collections) ? current.collections.filter(Boolean) : [],
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
