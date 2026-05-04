/**
 * Collections demo: inserts a row into the `messages` collection (declared in codemation.config.ts).
 *
 * Run from the canvas with the manual trigger. The "messages" collection's schema is auto-synced
 * at host startup via `defineCollection` + `CollectionSchemaSyncer` — no Prisma migration required.
 *
 * Each manual run inserts one fixed row. After running, navigate to `/collections/messages`
 * in the UI (or run `pnpm codemation collections rows messages`) to see the inserted rows.
 *
 * To insert different rows, edit the `data` literal below or wire a MapData node before this one
 * to construct the payload from the trigger input.
 */
import { workflow } from "@codemation/host";
import { collectionInsertNode } from "@codemation/core-nodes";

export default workflow("wf.test-dev.collections.demo")
  .name("Collections demo: insert a message")
  .manualTrigger<unknown>("Seed a message", [{}])
  .then(
    collectionInsertNode.create({
      collectionName: "messages",
      data: {
        sender_email: "demo@codemation.test",
        body: "Hello from a manual workflow run!",
        sent_at: new Date().toISOString(),
      },
    }),
  )
  .build();
