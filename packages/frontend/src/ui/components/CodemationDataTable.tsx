"use client";

import type { ReactNode } from "react";

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
 * Shared table shell aligned with app data-table styles ({@link codemation-data-table} in host CSS).
 */
export function CodemationDataTable(props: CodemationDataTableProps) {
  return (
    <table className="codemation-data-table" data-testid={props.tableTestId}>
      <thead>
        <tr>
          {props.columns.map((column) => (
            <th key={column.key} data-testid={column.headerTestId ?? `codemation-table-header-${column.key}`}>
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{props.children}</tbody>
    </table>
  );
}
