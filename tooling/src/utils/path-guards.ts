export function requireNonEmptyPathOption(value: string | undefined, optionName: string): string {
  const normalized = String(value || '').trim();
  if (!normalized) {
    throw new Error(
      `${optionName} is required. Resolve it from the active design system context.`,
    );
  }
  if (normalized.includes('\0')) {
    throw new Error(`${optionName} contains invalid null-byte characters.`);
  }
  return normalized;
}
