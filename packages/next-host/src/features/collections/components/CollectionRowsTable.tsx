"use client";

import type { CollectionDetailDto, CollectionRowDto } from "@codemation/host/dto";
import Pencil from "lucide-react/dist/esm/icons/pencil";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { HumanFriendlyTimestampFormatter } from "../../lib/HumanFriendlyTimestampFormatter";
import { CodemationDataTable } from "../../../components/CodemationDataTable";

type CollectionRowsTableProps = Readonly<{
  detail: CollectionDetailDto;
  rows: ReadonlyArray<CollectionRowDto>;
  onEdit: (row: CollectionRowDto) => void;
  onDelete: (row: CollectionRowDto) => void;
}>;

function humanizeFieldName(name: string): string {
  const spaced = name.replace(/_/g, " ").trim();
  if (spaced.length === 0) return name;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatCellValue(value: unknown): string {
  if (value === undefined || value === null) return "—";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

export function CollectionRowsTable({ detail, rows, onEdit, onDelete }: CollectionRowsTableProps) {
  const fixedColumns = [
    { key: "id", header: "ID" },
    { key: "created_at", header: "Created" },
    { key: "updated_at", header: "Updated" },
  ] as const;

  const dataColumns = detail.fields.map((f) => ({ key: f.name, header: humanizeFieldName(f.name) }));
  const actionsColumn = { key: "actions", header: "" } as const;

  const columns = [...fixedColumns, ...dataColumns, actionsColumn];

  if (rows.length === 0) {
    return (
      <div
        className="rounded-lg border border-dashed border-border bg-muted/30 px-6 py-10 text-center text-sm text-muted-foreground"
        data-testid="collection-rows-empty"
      >
        No rows yet.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <CodemationDataTable tableTestId="collection-rows-table" columns={columns}>
        {rows.map((row) => (
          <TableRow key={row.id} data-testid={`collection-row-${row.id}`} className="align-top">
            <TableCell className="w-[14rem] align-top">
              <span
                className="block break-all font-mono text-xs text-muted-foreground"
                data-testid={`collection-row-id-${row.id}`}
              >
                {row.id}
              </span>
            </TableCell>
            <TableCell className="whitespace-nowrap align-top">
              <span className="text-xs text-muted-foreground" title={new Date(row.created_at).toISOString()}>
                {HumanFriendlyTimestampFormatter.formatRunListWhen(row.created_at)}
              </span>
            </TableCell>
            <TableCell className="whitespace-nowrap align-top">
              <span className="text-xs text-muted-foreground" title={new Date(row.updated_at).toISOString()}>
                {HumanFriendlyTimestampFormatter.formatRunListWhen(row.updated_at)}
              </span>
            </TableCell>
            {detail.fields.map((f) => (
              <TableCell key={f.name} className="align-top" data-testid={`collection-row-field-${row.id}-${f.name}`}>
                <span className="block whitespace-pre-wrap break-words text-sm">
                  {formatCellValue(row.data[f.name])}
                </span>
              </TableCell>
            ))}
            <TableCell className="w-[6rem] whitespace-nowrap align-top text-right">
              <div className="flex items-center justify-end gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => onEdit(row)}
                  aria-label="Edit row"
                  title="Edit row"
                  data-testid={`collection-row-edit-${row.id}`}
                >
                  <Pencil className="h-4 w-4" aria-hidden />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => onDelete(row)}
                  aria-label="Delete row"
                  title="Delete row"
                  data-testid={`collection-row-delete-${row.id}`}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </CodemationDataTable>
    </div>
  );
}
