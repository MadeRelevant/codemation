/**
 * @description WebhookTrigger receives a POST → MapData validates shape → HttpRequest forwards result.
 * Demonstrates WebhookTrigger as the primary inbound HTTP activation node. Validates the request body
 * with a Zod inputSchema; mismatched payloads are rejected before the workflow runs.
 * @tags webhook, inbound-http, trigger, http, endpoint, validation, zod, inbound, style:node
 * @uses @codemation/core-nodes, node:WebhookTrigger
 * @dependencies @codemation/core-nodes@workspace:*
 */

// Non-manual triggers use createWorkflowBuilder + .trigger(new <Trigger>(...)).
import { createWorkflowBuilder, WebhookTrigger, MapData, HttpRequest } from "@codemation/core-nodes";
import { z } from "zod";

const eventSchema = z.object({
  eventId: z.string(),
  eventType: z.string(),
  occurredAt: z.string(),
  payload: z.record(z.string(), z.unknown()),
});

type EventPayload = z.infer<typeof eventSchema>;
type ForwardedEvent = EventPayload & Readonly<{ forwardedAt: string }>;

export default createWorkflowBuilder({
  id: "example.node-webhooktrigger",
  name: "WebhookTrigger: inbound event → validate → forward",
})
  // WebhookTrigger exposes an HTTP endpoint in the workspace.
  // endpointKey becomes part of the URL: /api/webhooks/<workspaceSlug>/<endpointKey>.
  // methods restricts which HTTP verbs are accepted (rejected with 405 otherwise).
  // inputSchema (Zod) validates + coerces the request body; invalid bodies get a 400 response.
  .trigger(
    new WebhookTrigger("Inbound event", {
      endpointKey: "inbound-event",
      methods: ["POST"],
      inputSchema: eventSchema,
    }),
  )
  .then(
    new MapData<EventPayload, ForwardedEvent>("Stamp forwarded time", (item) => ({
      ...item.json,
      forwardedAt: new Date().toISOString(),
    })),
  )
  .then(
    new HttpRequest("Forward to downstream", {
      method: "POST",
      url: "https://api.example.com/ingest",
      body: {
        kind: "json",
        data: JSON.stringify({ source: "codemation" }),
      },
      headers: { "Content-Type": "application/json" },
    }),
  )
  .build();
