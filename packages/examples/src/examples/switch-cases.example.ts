/**
 * @description Webhook trigger → Switch on event type → per-case downstream branch. Demonstrates dynamic port routing.
 * @tags branching, switch, control-flow, routing, event, cases, webhook, conditional, dispatch, style:scenario
 * @uses @codemation/core-nodes, node:WebhookTrigger, node:Switch, node:MapData, node:NoOp
 * @dependencies @codemation/core-nodes@workspace:*
 */

import { workflow } from "@codemation/host";
import { Switch, MapData, NoOp } from "@codemation/core-nodes";

type WebhookEvent = Readonly<{
  eventType: "order.created" | "order.cancelled" | "order.shipped";
  orderId: string;
  payload: Record<string, unknown>;
}>;

type HandledEvent = WebhookEvent & Readonly<{ handledAs: string; handledAt: string }>;

// The workflow() DSL only provides .manualTrigger() as a starting point.
// For a webhook trigger, wrap the trigger via .then(new Switch(...)) after using
// createWorkflowBuilder, or use manualTrigger + Switch together as shown here:

export default workflow("example.switch-cases")
  .name("Switch: route by event type")
  .manualTrigger<WebhookEvent>("Simulate webhook event", [
    { eventType: "order.created", orderId: "ORD-001", payload: { amount: 250 } },
    { eventType: "order.cancelled", orderId: "ORD-002", payload: { reason: "customer request" } },
    { eventType: "order.shipped", orderId: "ORD-003", payload: { carrier: "DHL" } },
  ])
  // Each item routes to the matching case port. Unknown eventType values go to "other".
  .then(
    new Switch<WebhookEvent>("Route by event type", {
      cases: ["order.created", "order.cancelled", "order.shipped"],
      defaultCase: "other",
      resolveCaseKey: (item) => item.json.eventType,
    }),
  )
  .route({
    "order.created": (branch) =>
      branch.then(
        new MapData<WebhookEvent, HandledEvent>("Handle order.created", (item) => ({
          ...item.json,
          handledAs: "order.created",
          handledAt: new Date().toISOString(),
        })),
      ),
    "order.cancelled": (branch) =>
      branch.then(
        new MapData<WebhookEvent, HandledEvent>("Handle order.cancelled", (item) => ({
          ...item.json,
          handledAs: "order.cancelled",
          handledAt: new Date().toISOString(),
        })),
      ),
    "order.shipped": (branch) =>
      branch.then(
        new MapData<WebhookEvent, HandledEvent>("Handle order.shipped", (item) => ({
          ...item.json,
          handledAs: "order.shipped",
          handledAt: new Date().toISOString(),
        })),
      ),
    other: (branch) => branch.then(new NoOp("Unhandled event type (sink)")),
  })
  .build();
