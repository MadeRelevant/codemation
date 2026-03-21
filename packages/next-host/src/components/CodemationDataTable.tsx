"use client";

import type { ReactNode } from "react";

import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type CodemationDataTableColumn = Readonly<{
  key: string;
  header: string;
  headerTestId?: string;
}>;

export type CodemationDataTableProps = Readonly<{
  tableTestId: string;
  columns: ReadonlyArray<CodemationDataTableColumn>;
  children: ReactNode;
}>;

/**
 * Shared data table using shadcn/ui Table primitives and design tokens.
 */
export function CodemationDataTable(props: CodemationDataTableProps) {
  return (
    <Table data-testid={props.tableTestId}>
      <TableHeader>
        <TableRow>
          {props.columns.map((column) => (
            <TableHead key={column.key} data-testid={column.headerTestId ?? `codemation-table-header-${column.key}`}>
              {column.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>{props.children}</TableBody>
    </Table>
  );
}
