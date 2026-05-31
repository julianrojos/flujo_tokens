import { ArrowLeft, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";

export interface PrevNextNavProps {
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onFirst?: () => void;
  onLast?: () => void;
  currentIndex: number;
  totalItems: number;
  previousLabel?: string;
  nextLabel?: string;
  firstLabel?: string;
  lastLabel?: string;
}

export function PrevNextNav({
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
  onFirst,
  onLast,
  currentIndex,
  totalItems,
  previousLabel = "Prev",
  nextLabel = "Next",
  firstLabel = "First",
  lastLabel = "Last",
}: PrevNextNavProps) {
  const hasMultipleItems = totalItems > 1;
  const showBoundaryControls = hasMultipleItems;
  const showPreviousButton = hasPrevious || (showBoundaryControls && Boolean(onLast));
  const showNextButton = hasNext || (showBoundaryControls && Boolean(onFirst));
  const resolvedPreviousLabel = hasPrevious ? previousLabel : lastLabel;
  const resolvedNextLabel = hasNext ? nextLabel : firstLabel;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {showPreviousButton ? (
        <Button
          variant="outline"
          size="sm"
          onClick={hasPrevious ? onPrevious : onLast}
          disabled={!hasPrevious && !onLast}
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> {resolvedPreviousLabel}
        </Button>
      ) : null}
      {showNextButton ? (
        <Button
          variant="outline"
          size="sm"
          onClick={hasNext ? onNext : onFirst}
          disabled={!hasNext && !onFirst}
        >
          {resolvedNextLabel} <ArrowRight className="ml-2 h-4 w-4" />
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
