"use client";

import type { CollectionRowDto } from "@codemation/host/dto";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { CollectionDeleteRowDialog } from "../components/CollectionDeleteRowDialog";
import { CollectionBulkDeleteDialog } from "../components/CollectionBulkDeleteDialog";

const PAGE_SIZE = 20;

type CollectionDetailScreenProps = Readonly<{ name: string }>;

export function CollectionDetailScreen({ name }: CollectionDetailScreenProps) {
  const [page, setPage] = useState(1);
  const [newRowOpen, setNewRowOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<CollectionRowDto | null>(null);
  const [deletingRow, setDeletingRow] = useState<CollectionRowDto | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const offset = (page - 1) * PAGE_SIZE;

  const detailQuery = useCollectionDetailQuery(name);
  const rowsQuery = useCollectionRowsQuery(name, { limit: PAGE_SIZE, offset });

  const insertMutation = useInsertCollectionRowMutation(name);
  const updateMutation = useUpdateCollectionRowMutation(name);
  const deleteMutation = useDeleteCollectionRowMutation(name);

  const detail = detailQuery.data ?? null;
  const rowsResult = rowsQuery.data;
  const rows = useMemo(() => rowsResult?.rows ?? [], [rowsResult]);
  const total = rowsResult?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Drop selections that no longer exist on the current page (after delete or page change).
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const onPage = new Set(rows.map((r) => r.id));
      const next = new Set<string>();
      for (const id of prev) {
        if (onPage.has(id)) next.add(id);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [rows]);

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

  const handleDeleteOne = useCallback(async () => {
    if (!deletingRow) return;
    await deleteMutation.mutateAsync(deletingRow.id);
    setDeletingRow(null);
  }, [deletingRow, deleteMutation]);

  const handleToggleRow = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const handleToggleAllOnPage = useCallback(
    (checked: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (checked) for (const r of rows) next.add(r.id);
        else for (const r of rows) next.delete(r.id);
        return next;
      });
    },
    [rows],
  );

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    try {
      // Sequential delete keeps the optimistic-style UX simple and avoids hammering
      // the API with parallel mutations on the same query key.
      for (const id of [...selectedIds]) {
        await deleteMutation.mutateAsync(id);
      }
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
    } finally {
      setBulkDeleting(false);
    }
  }, [deleteMutation, selectedIds]);

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

  const selectedCount = selectedIds.size;

  return (
    <div data-testid="collection-detail-screen" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold" data-testid="collection-detail-name">
            {detail.name}
          </h1>
          <p className="text-sm text-muted-foreground">{detail.fields.length} fields</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selectedCount > 0 && (
            <Button
              type="button"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => setBulkDeleteOpen(true)}
              data-testid="collection-bulk-delete-button"
            >
              Delete selected ({selectedCount})
            </Button>
          )}
          <Button type="button" onClick={() => setNewRowOpen(true)} data-testid="collection-new-row-button">
            New row
          </Button>
        </div>
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
            selectedIds={selectedIds}
            onToggleRow={handleToggleRow}
            onToggleAllOnPage={handleToggleAllOnPage}
            onEdit={(row) => setEditingRow(row)}
            onDelete={(row) => setDeletingRow(row)}
          />
          {total > 0 && (
            <CollectionRowsPagination
              page={page}
              pageCount={pageCount}
              pageSize={PAGE_SIZE}
              total={total}
              onPageChange={setPage}
            />
          )}
        </>
      )}

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

      <CollectionDeleteRowDialog
        row={deletingRow}
        isPending={deleteMutation.isPending}
        onCancel={() => setDeletingRow(null)}
        onConfirm={() => void handleDeleteOne()}
      />

      <CollectionBulkDeleteDialog
        open={bulkDeleteOpen}
        collectionName={detail.name}
        selectedCount={selectedCount}
        isPending={bulkDeleting}
        onCancel={() => setBulkDeleteOpen(false)}
        onConfirm={() => void handleBulkDelete()}
      />
    </div>
  );
}
