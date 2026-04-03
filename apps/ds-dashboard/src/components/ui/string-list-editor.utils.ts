export function getAddItemAriaLabel(label?: string): string {
  return label ? `Add ${label} item` : "Add item";
}

export function getRemoveItemAriaLabel(label: string | undefined, index: number): string {
  return label ? `Remove ${label} item ${index + 1}` : `Remove item ${index + 1}`;
}

export function syncItemIdsByLength(
  currentIds: string[],
  nextLength: number,
  createId: () => string,
): string[] {
  if (currentIds.length === nextLength) return currentIds;
  return Array.from({ length: nextLength }, () => createId());
}
