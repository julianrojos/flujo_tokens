/**
 * Component Nav Bar Section
 */

import { PrevNextNav } from "@/components/composites";
import type { ComponentCatalogItem } from "@/types/component-catalog";

interface ComponentNavBarProps {
  previousItem: ComponentCatalogItem | null;
  nextItem: ComponentCatalogItem | null;
  firstItem: ComponentCatalogItem | null;
  lastItem: ComponentCatalogItem | null;
  currentIndex: number;
  totalItems: number;
  onNavigate: (slug: string) => void;
}

export function ComponentNavBar({ previousItem, nextItem, firstItem, lastItem, currentIndex, totalItems, onNavigate }: ComponentNavBarProps) {
  return (
    <PrevNextNav
      hasPrevious={Boolean(previousItem)}
      hasNext={Boolean(nextItem)}
      onPrevious={() => onNavigate(previousItem!.slug)}
      onNext={() => onNavigate(nextItem!.slug)}
      onFirst={firstItem ? () => onNavigate(firstItem.slug) : undefined}
      onLast={lastItem ? () => onNavigate(lastItem.slug) : undefined}
      currentIndex={currentIndex}
      totalItems={totalItems}
    />
  );
}
