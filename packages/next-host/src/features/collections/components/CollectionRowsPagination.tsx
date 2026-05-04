"use client";

import { Button } from "@/components/ui/button";

type CollectionRowsPaginationProps = Readonly<{
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}>;

export function CollectionRowsPagination({ page, pageCount, onPageChange }: CollectionRowsPaginationProps) {
  return (
    <div className="flex items-center justify-end gap-2 pt-2" data-testid="collection-rows-pagination">
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
      <span className="text-sm text-muted-foreground" data-testid="collection-rows-pagination-label">
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
  );
}
