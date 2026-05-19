"use client";

import Link from "next/link";
import { Badge } from "@codemation/ui";
import { CodemationDataTable } from "../../../components/CodemationDataTable";
import { TableCell, TableRow } from "@/components/ui/table";
import { useCollectionsQuery } from "../hooks/useCollectionsQuery";

export function CollectionsScreen() {
  const query = useCollectionsQuery();
  const collections = query.data ?? [];

  return (
    <div data-testid="collections-screen" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="m-0 max-w-2xl text-sm text-muted-foreground">
          Collections are typed, database-backed tables declared in your <code>codemation.config.ts</code>.
        </p>
      </div>

      {query.isError && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
          data-testid="collections-load-error"
        >
          Failed to load collections.
        </div>
      )}

      {query.isLoading ? (
        <div className="text-sm text-muted-foreground" data-testid="collections-loading">
          Loading…
        </div>
      ) : collections.length === 0 ? (
        <div
          className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground"
          data-testid="collections-empty"
        >
          No collections registered. Add a <code>defineCollection(…)</code> to your config.
        </div>
      ) : (
        <CodemationDataTable
          tableTestId="collections-table"
          columns={[
            { key: "name", header: "Name" },
            { key: "fields", header: "Fields" },
            { key: "rows", header: "Rows" },
          ]}
        >
          {collections.map((col) => (
            <TableRow key={col.name} data-testid={`collection-row-${col.name}`}>
              <TableCell>
                <Link
                  href={`/collections/${encodeURIComponent(col.name)}`}
                  className="cursor-pointer font-medium text-primary underline-offset-4 hover:underline"
                  data-testid={`collection-name-${col.name}`}
                >
                  {col.name}
                </Link>
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className="text-muted-foreground"
                  data-testid={`collection-field-count-${col.name}`}
                >
                  {col.fieldCount} fields
                </Badge>
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className="text-muted-foreground"
                  data-testid={`collection-row-count-${col.name}`}
                >
                  {col.rowCount.toLocaleString()}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </CodemationDataTable>
      )}
    </div>
  );
}
