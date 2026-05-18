/**
 * @description Manual trigger with a nested array → Split expands one item per tag → MapData enriches each.
 * Demonstrates Split as the primary fan-out node: getElements receives item + ctx, returns an array.
 * @tags split, fan-out, array, expand, parallel, batch, per-item, style:node
 * @uses @codemation/core-nodes, node:Split
 * @dependencies @codemation/core-nodes@workspace:*
 */

import { workflow } from "@codemation/host";
import { Split, MapData } from "@codemation/core-nodes";

type Article = Readonly<{
  id: string;
  title: string;
  tags: ReadonlyArray<string>;
}>;

type TagEntry = Readonly<{
  articleId: string;
  tag: string;
  normalizedTag: string;
}>;

export default workflow("example.node-split")
  .name("Split: expand article tags into individual items")
  .manualTrigger<Article>("Articles with tags", [
    { id: "a1", title: "Intro to TypeScript", tags: ["typescript", "javascript", "beginner"] },
    { id: "a2", title: "Advanced Patterns", tags: ["typescript", "architecture"] },
  ])
  // Split expands one input item into N output items.
  // Use it when item.json holds an array you want to process element-by-element downstream.
  // getElements returns a typed array; each element becomes a separate item on the main port.
  .then(
    new Split<Article, TagEntry>("Expand tags", (item) =>
      item.json.tags.map((tag) => ({
        articleId: item.json.id,
        tag,
        normalizedTag: tag.toLowerCase().replace(/\s+/g, "-"),
      })),
    ),
  )
  // Each TagEntry is now an independent item — process them in parallel downstream.
  .then(
    new MapData<TagEntry, TagEntry & { label: string }>("Add label", (item) => ({
      ...item.json,
      label: `${item.json.articleId}::${item.json.normalizedTag}`,
    })),
  )
  .build();
