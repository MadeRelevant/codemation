import { defineNode } from "@codemation/core";
import { z } from "zod";

export const collectionGetNode = defineNode({
  key: "collection-get",
  title: "Collection: Get",
  description: "Get a single row by id from a collection.",
  icon: "lucide:layers",
  configSchema: z.object({
    collectionName: z.string(),
    id: z.string(),
  }),
  async execute(_args, { config, execution }) {
    const store = execution.collections?.[config.collectionName];
    if (!store) {
      throw new Error(
        `Collection "${config.collectionName}" is not registered. Add defineCollection to your codemation config.`,
      );
    }
    const row = await store.get(config.id);
    if (row === null) {
      return [];
    }
    return row;
  },
});
