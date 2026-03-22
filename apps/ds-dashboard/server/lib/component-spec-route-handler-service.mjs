export function buildComponentSpecGetPayload({
  slug,
  specRelPath,
  exists,
  raw,
  parseYamlSafelyFn,
  sha256TextFn,
}) {
  const parsedPayload = parseYamlSafelyFn(raw);
  return {
    ok: true,
    slug,
    path: specRelPath,
    exists,
    raw,
    rawHash: exists ? sha256TextFn(raw) : null,
    parsed: parsedPayload.parsed,
    parseError: parsedPayload.parseError,
  };
}

export function buildValidateComponentSpecRouteArgs({
  slug,
  specRelPath,
  specAbsPath,
  tokenRegistryPath,
  maxBytes,
  body,
}) {
  return {
    slug,
    path: specRelPath,
    raw: String(body?.raw ?? ""),
    specAbsPath,
    tokenRegistryPath,
    maxBytes,
  };
}

function normalizeExpectedHash(rawExpectedHash) {
  if (rawExpectedHash === null || rawExpectedHash === undefined) return null;
  return String(rawExpectedHash).trim() || null;
}

export function buildSaveComponentSpecRouteArgs({
  slug,
  specRelPath,
  specAbsPath,
  specBackupsDirPath,
  repoRoot,
  tokenRegistryPath,
  maxBytes,
  body,
}) {
  return {
    slug,
    path: specRelPath,
    raw: String(body?.raw ?? ""),
    specAbsPath,
    specBackupsDirPath,
    repoRoot,
    tokenRegistryPath,
    expectedHash: normalizeExpectedHash(body?.expectedHash),
    confirmRiskyChanges: body?.confirmRiskyChanges === true,
    refreshRegistryAfterSave: body?.refreshRegistry !== false,
    maxBytes,
  };
}

export function buildPatchEditorialSpecRouteArgs({
  slug,
  specRelPath,
  specAbsPath,
  markdownAbsPath,
  markdownRelPath,
  specBackupsDirPath,
  repoRoot,
  body,
}) {
  return {
    slug,
    path: specRelPath,
    specAbsPath,
    markdownAbsPath: markdownAbsPath || null,
    markdownRelPath: markdownRelPath || null,
    specBackupsDirPath,
    repoRoot,
    body: {
      expectedHash: normalizeExpectedHash(body?.expectedHash),
      fields: body?.fields ?? {},
    },
  };
}

export function buildRestoreComponentSpecRouteArgs({
  slug,
  specRelPath,
  specAbsPath,
  repoRoot,
  specBackupsDirPath,
  body,
  sha256TextFn,
}) {
  return {
    slug,
    specRelPath,
    specAbsPath,
    repoRoot,
    specBackupsDirPath,
    refreshRegistryAfterRestore: body?.refreshRegistry !== false,
    sha256TextFn,
  };
}
