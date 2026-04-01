interface DesignSystemConfigEntryShape {
  id: string;
  figmaFileId?: string;
}

export interface DesignSystemContextResolution {
  systemId: string;
  dsFileKey: string | null;
}

export function resolveDesignSystemContext(
  config: { defaultSystem?: string; systems?: DesignSystemConfigEntryShape[] } | null,
  activeSystemId: string,
): DesignSystemContextResolution {
  const configuredSystems = config?.systems ?? [];
  const activeSystemIdTrimmed = String(activeSystemId || "").trim();
  const defaultSystemId = String(config?.defaultSystem || "").trim();

  const activeSystem = activeSystemIdTrimmed
    ? configuredSystems.find((entry) => String(entry.id || "").trim() === activeSystemIdTrimmed) ?? null
    : null;
  const fallbackSystem = defaultSystemId
    ? configuredSystems.find((entry) => String(entry.id || "").trim() === defaultSystemId) ?? null
    : null;
  const resolved = activeSystem ?? fallbackSystem;

  return {
    systemId: String(resolved?.id || "").trim(),
    dsFileKey: String(resolved?.figmaFileId || "").trim() || null,
  };
}

export function resolveDsFileKeyFromConfig(
  config: { defaultSystem?: string; systems: DesignSystemConfigEntryShape[] },
  activeSystemId: string,
): string | null {
  return resolveDesignSystemContext(config, activeSystemId).dsFileKey;
}
