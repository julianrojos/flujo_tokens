import { Button } from "@/components/ui/button";

interface PaginationFooterProps {
  hasPagination: boolean;
  pageStart: number;
  pageEnd: number;
  totalItems: number;
  currentPage: number;
  totalPages: number;
  canGoPrevious: boolean;
  canGoNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}

export function PaginationFooter({
  hasPagination,
  pageStart,
  pageEnd,
  totalItems,
  currentPage,
  totalPages,
  canGoPrevious,
  canGoNext,
  onPrevious,
  onNext,
}: PaginationFooterProps) {
  if (!hasPagination) return null;

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
      <p className="text-xs text-muted-foreground">
        Showing {pageStart}-{pageEnd} of {totalItems}
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onPrevious}
          disabled={!canGoPrevious}
        >
          Prev
        </Button>
        <span className="text-xs text-muted-foreground">
          {currentPage} / {totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onNext}
          disabled={!canGoNext}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
