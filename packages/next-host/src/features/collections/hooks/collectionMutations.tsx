"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteCollectionRow, insertCollectionRow, updateCollectionRow } from "../api/collectionsApi";
import { collectionsQueryKey } from "./useCollectionsQuery";

export function useInsertCollectionRowMutation(name: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Readonly<Record<string, unknown>>) => insertCollectionRow(name, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["collections", name, "rows"] });
      await queryClient.invalidateQueries({ queryKey: collectionsQueryKey });
    },
  });
}

export function useUpdateCollectionRowMutation(name: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: Readonly<{ id: string; patch: Readonly<Record<string, unknown>> }>) =>
      updateCollectionRow(name, args.id, args.patch),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["collections", name, "rows"] });
    },
  });
}

export function useDeleteCollectionRowMutation(name: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCollectionRow(name, id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["collections", name, "rows"] });
      await queryClient.invalidateQueries({ queryKey: collectionsQueryKey });
    },
  });
}
