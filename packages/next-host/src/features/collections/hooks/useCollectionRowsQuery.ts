"use client";

import { useQuery } from "@tanstack/react-query";
import { listCollectionRows } from "../api/collectionsApi";

export function collectionRowsQueryKey(
  name: string,
  params: Readonly<{ limit?: number; offset?: number; where?: Readonly<Record<string, string>> }>,
) {
  return ["collections", name, "rows", params] as const;
}

export function useCollectionRowsQuery(
  name: string,
  params: Readonly<{ limit?: number; offset?: number; where?: Readonly<Record<string, string>> }> = {},
) {
  return useQuery({
    queryKey: collectionRowsQueryKey(name, params),
    queryFn: () => listCollectionRows(name, params),
    enabled: name.length > 0,
  });
}
