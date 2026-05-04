"use client";

import type { CollectionDetailDto, CollectionRowDto } from "@codemation/host/dto";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { CodemationDataTable } from "../../../components/CodemationDataTable";

type CollectionRowsTableProps = Readonly<{
  detail: CollectionDetailDto;
  rows: ReadonlyArray<CollectionRowDto>;
  onEdit: (row: CollectionRowDto) => void;
  onDelete: (row: CollectionRowDto) => void;
}>;

export function CollectionRowsTable({ detail, rows, onEdit, onDelete }: CollectionRowsTableProps) {
  const fixedColumns = [
    { key: "id", header: "ID" },
    { key: "created_at", header: "Created" },
    { key: "updated_at", header: "Updated" },
  ] as const;

  const dataColumns = detail.fields.map((f) => ({ key: f.name, header: f.name }));
  const actionsColumn = { key: "actions", header: "Actions" } as const;

  const columns = [...fixedColumns, ...dataColumns, actionsColumn];

  if (rows.length === 0) {
    return (
      <div
        className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground"
        data-testid="collection-rows-empty"
      >
        No rows yet.
      </div>
    );
  }

  return (
    <CodemationDataTable tableTestId="collection-rows-table" columns={columns}>
      {rows.map((row) => (
        <TableRow key={row.id} data-testid={`collection-row-${row.id}`}>
          <TableCell className="align-top">
            <span
              className="block whitespace-pre-wrap break-all font-mono text-xs"
              data-testid={`collection-row-id-${row.id}`}
            >
              {row.id}
            </span>
          </TableCell>
          <TableCell>
            <span className="text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString()}</span>
          </TableCell>
          <TableCell>
            <span className="text-xs text-muted-foreground">{new Date(row.updated_at).toLocaleString()}</span>
          </TableCell>
          {detail.fields.map((f) => (
            <TableCell key={f.name} data-testid={`collection-row-field-${row.id}-${f.name}`} className="align-top">
              <span className="block whitespace-pre-wrap break-words text-sm">
                {row.data[f.name] !== undefined && row.data[f.name] !== null
                  ? typeof row.data[f.name] === "object"
                    ? JSON.stringify(row.data[f.name])
                    : String(row.data[f.name])
                  : "—"}
              </span>
            </TableCell>
          ))}
          <TableCell>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onEdit(row)}
                data-testid={`collection-row-edit-${row.id}`}
              >
                Edit
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={() => onDelete(row)}
                data-testid={`collection-row-delete-${row.id}`}
              >
                Delete
              </Button>
            </div>
          </TableCell>
        </TableRow>
      ))}
    </CodemationDataTable>
  );
}
