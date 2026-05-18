/**
 * @description Webhook trigger → If predicate → two distinct downstream branches. Regression test
 * for the port-validation fix: only .true and .false branches are declared. No .main port exists.
 * @tags branching, if, control-flow, conditional, routing, webhook, predicate, two-branch, style:scenario
 * @uses @codemation/core-nodes, node:WebhookTrigger, node:If, node:MapData
 * @dependencies @codemation/core-nodes@workspace:*
 */

// Non-manual triggers use createWorkflowBuilder + .trigger(new <Trigger>(...)).
import { createWorkflowBuilder, WebhookTrigger, If, MapData } from "@codemation/core-nodes";

type OrderPayload = Readonly<{
  orderId: string;
  amount: number;
  currency: string;
}>;

type ProcessedOrder = OrderPayload & Readonly<{ tier: "high-value" | "standard"; processedAt: string }>;

export default createWorkflowBuilder({ id: "example.if-branch", name: "If: route by order value" })
  .trigger(
    new WebhookTrigger("Order event", {
      endpointKey: "order-event",
      methods: ["POST"],
    }),
  )
  // If only declares "true" and "false" ports — this is the correct, validated shape.
  // A phantom "main" port would mean the port-validation fix has a hole on the authoring side.
  .then(new If<OrderPayload>("High-value order?", (item) => item.json.amount >= 1000))
  .when({
    true: [
      new MapData<OrderPayload, ProcessedOrder>("Tag high-value", (item) => ({
        ...item.json,
        tier: "high-value",
        processedAt: new Date().toISOString(),
      })),
    ],
    false: [
      new MapData<OrderPayload, ProcessedOrder>("Tag standard", (item) => ({
        ...item.json,
        tier: "standard",
        processedAt: new Date().toISOString(),
      })),
    ],
  })
  .build();
