interface DesignSystemConfigEntryShape {
  id: string;
  figmaFileId?: string;
}

export function resolveDsFileKeyFromConfig(
  config: { systems: DesignSystemConfigEntryShape[] },
  activeSystemId: string,
): string | null {
  const systemId = String(activeSystemId || "").trim();
  if (!systemId) return null;

  const system = (config.systems || []).find((entry) => entry.id === systemId);
  const figmaFileId = String(system?.figmaFileId || "").trim();
  return figmaFileId || null;
}
