import { defineNode } from "@codemation/core";
import { z } from "zod";

export const collectionUpdateNode = defineNode({
  key: "collection-update",
  title: "Collection: Update",
  description: "Update a row by id in a collection.",
  icon: "lucide:square-pen",
  configSchema: z.object({
    collectionName: z.string(),
    id: z.string(),
    patch: z.record(z.string(), z.unknown()),
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
    return await store.update(config.id, config.patch);
  },
});
