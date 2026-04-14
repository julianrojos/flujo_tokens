import { ArrowLeft, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";

export interface PrevNextNavProps {
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  currentIndex: number;
  totalItems: number;
  previousLabel?: string;
  nextLabel?: string;
}

export function PrevNextNav({
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
  currentIndex,
  totalItems,
  previousLabel = "Prev",
  nextLabel = "Next",
}: PrevNextNavProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {hasPrevious ? (
        <Button variant="outline" size="sm" onClick={onPrevious}>
          <ArrowLeft className="mr-2 h-4 w-4" /> {previousLabel}
        </Button>
      ) : null}
      {hasNext ? (
        <Button variant="outline" size="sm" onClick={onNext}>
          {nextLabel} <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      ) : null}
      {totalItems > 1 && currentIndex >= 0 ? (
        <span className="text-xs text-muted-foreground">
          {currentIndex + 1} / {totalItems}
        </span>
      ) : null}
    </div>
  );
}
