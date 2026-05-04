"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type CollectionBulkDeleteDialogProps = Readonly<{
  open: boolean;
  collectionName: string;
  selectedCount: number;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}>;

export function CollectionBulkDeleteDialog({
  open,
  collectionName,
  selectedCount,
  isPending,
  onCancel,
  onConfirm,
}: CollectionBulkDeleteDialogProps) {
  const noun = selectedCount === 1 ? "row" : "rows";
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !isPending && onCancel()}>
      <DialogContent data-testid="collection-bulk-delete-dialog">
        <DialogHeader>
          <DialogTitle>
            Delete {selectedCount} {noun}?
          </DialogTitle>
          <DialogDescription>
            This will permanently delete {selectedCount} {noun} from
            <code className="mx-1">{collectionName}</code>. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            data-testid="collection-bulk-delete-confirm"
            disabled={isPending}
          >
            {isPending ? `Deleting ${selectedCount}…` : `Delete ${selectedCount}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
