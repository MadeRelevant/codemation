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
  inspectorSummary({ config }) {
    const name = config.collectionName ?? "";
    if (!name) return [];
    const truncated = name.length > 80 ? `${name.slice(0, 79)}…` : name;
    return [{ label: "Collection", value: truncated }];
  },
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
