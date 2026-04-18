/**
 * Component Nav Bar Section
 */

import { PrevNextNav } from "@/components/composites";
import type { ComponentCatalogItem } from "@/types/component-catalog";

interface ComponentNavBarProps {
  previousItem: ComponentCatalogItem | null;
  nextItem: ComponentCatalogItem | null;
  currentIndex: number;
  totalItems: number;
  onNavigate: (slug: string) => void;
}

export function ComponentNavBar({ previousItem, nextItem, currentIndex, totalItems, onNavigate }: ComponentNavBarProps) {
  return (
    <PrevNextNav
      hasPrevious={Boolean(previousItem)}
      hasNext={Boolean(nextItem)}
      onPrevious={() => onNavigate(previousItem!.slug)}
      onNext={() => onNavigate(nextItem!.slug)}
      currentIndex={currentIndex}
      totalItems={totalItems}
    />
  );
}
