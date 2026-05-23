"use client";

import { Button } from "@codemation/ui";

type CollectionRowsPaginationProps = Readonly<{
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}>;

export function CollectionRowsPagination({
  page,
  pageCount,
  pageSize,
  total,
  onPageChange,
}: CollectionRowsPaginationProps) {
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-2" data-testid="collection-rows-pagination">
      <span className="text-xs text-muted-foreground" data-testid="collection-rows-pagination-summary">
        Showing <span className="font-medium text-foreground">{rangeStart.toLocaleString()}</span>–
        <span className="font-medium text-foreground">{rangeEnd.toLocaleString()}</span> of{" "}
        <span className="font-medium text-foreground">{total.toLocaleString()}</span>
      </span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          data-testid="collection-rows-pagination-prev"
        >
          Previous
        </Button>
        <span className="text-xs text-muted-foreground" data-testid="collection-rows-pagination-label">
          Page {page} of {pageCount}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
          data-testid="collection-rows-pagination-next"
        >
          Next
        </Button>
      </div>
    </div>
  );
}
