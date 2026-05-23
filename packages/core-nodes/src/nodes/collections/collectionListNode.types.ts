import { defineNode } from "@codemation/core";
import { z } from "zod";

export const collectionListNode = defineNode({
  key: "collection-list",
  title: "Collection: List",
  description: "List rows from a collection with optional pagination and filtering.",
  icon: "lucide:split",
  configSchema: z.object({
    collectionName: z.string(),
    limit: z.number().int().positive().optional(),
    offset: z.number().int().nonnegative().optional(),
    where: z.record(z.string(), z.unknown()).optional(),
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
    const { rows } = await store.list({
      limit: config.limit,
      offset: config.offset,
      where: config.where,
    });
    // Emit one item per row per AGENTS.md engine/node contract.
    return [...rows];
  },
});
