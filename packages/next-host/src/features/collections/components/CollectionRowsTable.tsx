"use client";

import type { CollectionDetailDto, CollectionRowDto } from "@codemation/host/dto";
import { Button } from "@codemation/ui";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CodemationFormattedDateTime } from "../../../components/CodemationFormattedDateTime";

type CollectionRowsTableProps = Readonly<{
  detail: CollectionDetailDto;
  rows: ReadonlyArray<CollectionRowDto>;
  selectedIds: ReadonlySet<string>;
  onToggleRow: (id: string, checked: boolean) => void;
  onToggleAllOnPage: (checked: boolean) => void;
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

export function CollectionRowsTable({
  detail,
  rows,
  selectedIds,
  onToggleRow,
  onToggleAllOnPage,
  onEdit,
  onDelete,
}: CollectionRowsTableProps) {
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

  const selectedOnPageCount = rows.reduce((acc, r) => acc + (selectedIds.has(r.id) ? 1 : 0), 0);
  const headerCheckedState: boolean | "indeterminate" =
    selectedOnPageCount === 0 ? false : selectedOnPageCount === rows.length ? true : "indeterminate";

  return (
    <Table data-testid="collection-rows-table">
      <TableHeader>
        <TableRow>
          <TableHead className="w-[2.5rem]">
            <Checkbox
              checked={headerCheckedState}
              onCheckedChange={(value) => onToggleAllOnPage(value === true)}
              aria-label="Select all rows on this page"
              data-testid="collection-rows-select-all"
            />
          </TableHead>
          <TableHead>ID</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Updated</TableHead>
          {detail.fields.map((f) => (
            <TableHead key={f.name}>{humanizeFieldName(f.name)}</TableHead>
          ))}
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow
            key={row.id}
            data-testid={`collection-row-${row.id}`}
            data-state={selectedIds.has(row.id) ? "selected" : undefined}
            className="align-top"
          >
            <TableCell className="w-[2.5rem] align-top">
              <Checkbox
                checked={selectedIds.has(row.id)}
                onCheckedChange={(value) => onToggleRow(row.id, value === true)}
                aria-label={`Select row ${row.id}`}
                data-testid={`collection-row-select-${row.id}`}
              />
            </TableCell>
            <TableCell className="w-[14rem] align-top">
              <span
                className="block break-all font-mono text-xs text-muted-foreground"
                data-testid={`collection-row-id-${row.id}`}
              >
                {row.id}
              </span>
            </TableCell>
            <TableCell className="whitespace-nowrap align-top">
              <CodemationFormattedDateTime
                isoUtc={row.created_at}
                dataTestId={`collection-row-created-${row.id}`}
                className="text-xs text-muted-foreground"
              />
            </TableCell>
            <TableCell className="whitespace-nowrap align-top">
              <CodemationFormattedDateTime
                isoUtc={row.updated_at}
                dataTestId={`collection-row-updated-${row.id}`}
                className="text-xs text-muted-foreground"
              />
            </TableCell>
            {detail.fields.map((f) => (
              <TableCell key={f.name} className="align-top" data-testid={`collection-row-field-${row.id}-${f.name}`}>
                <span className="block whitespace-pre-wrap break-words text-sm">
                  {formatCellValue(row.data[f.name])}
                </span>
              </TableCell>
            ))}
            <TableCell className="whitespace-nowrap align-top">
              <div className="flex flex-wrap items-center gap-2">
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
                  variant="outline"
                  onClick={() => onDelete(row)}
                  data-testid={`collection-row-delete-${row.id}`}
                  className="text-destructive hover:text-destructive"
                >
                  Delete
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
