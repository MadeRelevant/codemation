"use client";

import type { CollectionRowDto } from "@codemation/host/dto";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCollectionDetailQuery } from "../hooks/useCollectionDetailQuery";
import { useCollectionRowsQuery } from "../hooks/useCollectionRowsQuery";
import {
  useInsertCollectionRowMutation,
  useUpdateCollectionRowMutation,
  useDeleteCollectionRowMutation,
} from "../hooks/collectionMutations";
import { CollectionRowForm } from "../components/CollectionRowForm";
import { CollectionRowsTable } from "../components/CollectionRowsTable";
import { CollectionRowsPagination } from "../components/CollectionRowsPagination";

const PAGE_SIZE = 20;

type CollectionDetailScreenProps = Readonly<{ name: string }>;

export function CollectionDetailScreen({ name }: CollectionDetailScreenProps) {
  const [page, setPage] = useState(1);
  const [newRowOpen, setNewRowOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<CollectionRowDto | null>(null);
  const [deletingRow, setDeletingRow] = useState<CollectionRowDto | null>(null);

  const offset = (page - 1) * PAGE_SIZE;

  const detailQuery = useCollectionDetailQuery(name);
  const rowsQuery = useCollectionRowsQuery(name, { limit: PAGE_SIZE, offset });

  const insertMutation = useInsertCollectionRowMutation(name);
  const updateMutation = useUpdateCollectionRowMutation(name);
  const deleteMutation = useDeleteCollectionRowMutation(name);

  const detail = detailQuery.data ?? null;
  const rowsResult = rowsQuery.data;
  const rows = rowsResult?.rows ?? [];
  const total = rowsResult?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleInsert = useCallback(
    async (data: Readonly<Record<string, unknown>>) => {
      await insertMutation.mutateAsync(data);
      setNewRowOpen(false);
    },
    [insertMutation],
  );

  const handleUpdate = useCallback(
    async (data: Readonly<Record<string, unknown>>) => {
      if (!editingRow) return;
      await updateMutation.mutateAsync({ id: editingRow.id, patch: data });
      setEditingRow(null);
    },
    [editingRow, updateMutation],
  );

  const handleDelete = useCallback(async () => {
    if (!deletingRow) return;
    await deleteMutation.mutateAsync(deletingRow.id);
    setDeletingRow(null);
  }, [deletingRow, deleteMutation]);

  if (detailQuery.isLoading) {
    return (
      <div className="text-sm text-muted-foreground" data-testid="collection-detail-loading">
        Loading…
      </div>
    );
  }

  if (!detail) {
    return (
      <div
        className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        role="alert"
        data-testid="collection-detail-not-found"
      >
        Collection &ldquo;{name}&rdquo; not found.
      </div>
    );
  }

  return (
    <div data-testid="collection-detail-screen" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold" data-testid="collection-detail-name">
            {detail.name}
          </h1>
          <p className="text-sm text-muted-foreground">{detail.fields.length} fields</p>
        </div>
        <Button type="button" onClick={() => setNewRowOpen(true)} data-testid="collection-new-row-button">
          New row
        </Button>
      </div>

      {rowsQuery.isLoading ? (
        <div className="text-sm text-muted-foreground" data-testid="collection-rows-loading">
          Loading rows…
        </div>
      ) : (
        <>
          <CollectionRowsTable
            detail={detail}
            rows={rows}
            onEdit={(row) => setEditingRow(row)}
            onDelete={(row) => setDeletingRow(row)}
          />
          {total > PAGE_SIZE && <CollectionRowsPagination page={page} pageCount={pageCount} onPageChange={setPage} />}
        </>
      )}

      {/* New row dialog */}
      <Dialog open={newRowOpen} onOpenChange={setNewRowOpen}>
        <DialogContent data-testid="collection-new-row-dialog">
          <DialogHeader>
            <DialogTitle>New row</DialogTitle>
          </DialogHeader>
          <CollectionRowForm
            fields={detail.fields}
            onSubmit={handleInsert}
            submitLabel="Insert"
            isSubmitting={insertMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Edit row dialog */}
      <Dialog
        open={editingRow !== null}
        onOpenChange={(open) => {
          if (!open) setEditingRow(null);
        }}
      >
        <DialogContent data-testid="collection-edit-row-dialog">
          <DialogHeader>
            <DialogTitle>Edit row</DialogTitle>
          </DialogHeader>
          {editingRow && (
            <CollectionRowForm
              fields={detail.fields}
              defaultValues={editingRow.data}
              onSubmit={handleUpdate}
              submitLabel="Update"
              isSubmitting={updateMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog
        open={deletingRow !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingRow(null);
        }}
      >
        <DialogContent data-testid="collection-delete-row-dialog">
          <DialogHeader>
            <DialogTitle>Delete row?</DialogTitle>
            <DialogDescription>
              This will permanently delete row <code>{deletingRow?.id}</code>. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeletingRow(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleDelete()}
              data-testid="collection-delete-row-confirm"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
