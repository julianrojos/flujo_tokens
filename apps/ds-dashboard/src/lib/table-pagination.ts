/**
 * Hide the page-size selector until a table has enough rows to benefit from it.
 * Below this threshold, the extra control adds noise without giving the user
 * meaningful pagination choices.
 */
export const PAGE_SIZE_THRESHOLD = 25;

/**
 * Expose the "All" option once the dataset is large enough that showing every
 * row remains a useful explicit choice.
 */
export const PAGE_SIZE_ALL_THRESHOLD = 176;

export function shouldShowPageSizeSelect(totalItems: number): boolean {
  return totalItems > PAGE_SIZE_THRESHOLD;
}

export function shouldAllowShowAll(totalItems: number): boolean {
  return totalItems >= PAGE_SIZE_ALL_THRESHOLD;
}
