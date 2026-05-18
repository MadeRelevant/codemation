/**
 * @description Cron trigger every 5 min → HTTP GET a JSON API → store new items in a collection.
 * @tags cron, http, polling, schedule, periodic, fetch, api, rest, store, collection, style:scenario
 * @uses @codemation/core-nodes, node:CronTrigger, node:HttpRequest, node:Split, node:Callback
 * @dependencies @codemation/core-nodes@workspace:*
 */

// Non-manual triggers use createWorkflowBuilder + .trigger(new <Trigger>(...)).
import { createWorkflowBuilder, CronTrigger, HttpRequest, Split, Callback } from "@codemation/core-nodes";
import type { HttpRequestOutputJson } from "@codemation/core-nodes";

type ApiItem = Readonly<{
  id: string;
  title: string;
  url: string;
}>;

type ApiResponse = Readonly<{
  items: ReadonlyArray<ApiItem>;
}>;

// The collection "feed_items" must be declared in codemation.config.ts via defineCollection(...).
export default createWorkflowBuilder({ id: "example.cron-api-poll", name: "Cron → HTTP GET → store new items" })
  .trigger(new CronTrigger("Every 5 minutes", { schedule: "*/5 * * * *", timezone: "UTC" }))
  .then(
    new HttpRequest("Fetch feed", {
      method: "GET",
      url: "https://api.example.com/v1/items?since=last_seen",
    }),
  )
  .then(
    new Split<HttpRequestOutputJson, ApiItem>("Split API items", (item) => {
      const body = item.json.json as ApiResponse | undefined;
      return [...(body?.items ?? [])];
    }),
  )
  .then(
    new Callback<ApiItem, ApiItem>("Upsert items", async (items, ctx) => {
      const store = ctx.collections?.["feed_items"];
      if (!store) throw new Error('Collection "feed_items" not registered in codemation.config.ts');

      return await Promise.all(
        items.map(async (item) => {
          // Only insert items not already present (idempotent by external id).
          const existing = await store.findOne({ id: item.json.id });
          if (!existing) {
            await store.insert({ ...item.json });
          }
          return item;
        }),
      );
    }),
  )
  .build();
