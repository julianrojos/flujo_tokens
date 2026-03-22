/**
 * Component Nav Bar Section
 */

import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { ComponentRegistryItem } from "@/types/component-registry";

interface ComponentNavBarProps {
  previousItem: ComponentRegistryItem | null;
  nextItem: ComponentRegistryItem | null;
  currentIndex: number;
  totalItems: number;
  onNavigate: (slug: string) => void;
  onBack: () => void;
}

export function ComponentNavBar({ previousItem, nextItem, currentIndex, totalItems, onNavigate, onBack }: ComponentNavBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" onClick={onBack}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Components
      </Button>
      {previousItem && (
        <Button variant="outline" size="sm" onClick={() => onNavigate(previousItem.slug)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Prev
        </Button>
      )}
      {nextItem && (
        <Button variant="outline" size="sm" onClick={() => onNavigate(nextItem.slug)}>
          Next <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      )}
      {totalItems > 0 && currentIndex >= 0 && (
        <span className="text-xs text-muted-foreground">
          {currentIndex + 1} / {totalItems}
        </span>
      )}
    </div>
  );
}
