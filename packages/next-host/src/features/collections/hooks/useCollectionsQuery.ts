"use client";

import { useQuery } from "@tanstack/react-query";
import { listCollections } from "../api/collectionsApi";

export const collectionsQueryKey = ["collections"] as const;

export function useCollectionsQuery() {
  return useQuery({
    queryKey: collectionsQueryKey,
    queryFn: () => listCollections(),
  });
}
