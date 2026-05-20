import { defineNode } from "@codemation/core";
import { z } from "zod";

export const collectionFindOneNode = defineNode({
  key: "collection-find-one",
  title: "Collection: Find One",
  description: "Find a single row matching a filter in a collection.",
  icon: "lucide:filter",
  configSchema: z.object({
    collectionName: z.string(),
    where: z.record(z.string(), z.unknown()),
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
    const row = await store.findOne(config.where);
    if (row === null) {
      return [];
    }
    return row;
  },
});
