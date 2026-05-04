"use client";

import type { CollectionRowDto } from "@codemation/host/dto";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type CollectionDeleteRowDialogProps = Readonly<{
  row: CollectionRowDto | null;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}>;

export function CollectionDeleteRowDialog({ row, isPending, onCancel, onConfirm }: CollectionDeleteRowDialogProps) {
  return (
    <Dialog
      open={row !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent data-testid="collection-delete-row-dialog">
        <DialogHeader>
          <DialogTitle>Delete row?</DialogTitle>
          <DialogDescription>
            This will permanently delete row <code>{row?.id}</code>. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            data-testid="collection-delete-row-confirm"
            disabled={isPending}
          >
            {isPending ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
