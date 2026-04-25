export function resolveOperationSystemId(args: {
  overrideSystemId?: string;
  activeSystemId?: string;
}): string {
  const override = String(args.overrideSystemId || "").trim();
  if (override) return override;
  return String(args.activeSystemId || "").trim();
}

export function buildOperationSystemHeaders(systemId: string): HeadersInit {
  const normalized = String(systemId || "").trim();
  return normalized ? { "x-ds-system": normalized } : {};
}
