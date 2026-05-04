"use client";

import { useQuery } from "@tanstack/react-query";
import { getCollection } from "../api/collectionsApi";

export function collectionDetailQueryKey(name: string) {
  return ["collections", name, "detail"] as const;
}

export function useCollectionDetailQuery(name: string) {
  return useQuery({
    queryKey: collectionDetailQueryKey(name),
    queryFn: () => getCollection(name),
    enabled: name.length > 0,
  });
}
