import { defineNode } from "@codemation/core";
import { z } from "zod";

export const collectionDeleteNode = defineNode({
  key: "collection-delete",
  title: "Collection: Delete",
  description: "Delete a row by id from a collection.",
  icon: "lucide:braces",
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
    const result = await store.delete(config.id);
    return { deleted: result.deleted, id: config.id };
  },
});
