/**
 * @description If branch → NoOp absorbs unwanted items on one branch; real processing on the other.
 * Demonstrates NoOp as the explicit sink/placeholder: items pass through unchanged, making the branch
 * visible in the canvas without adding accidental logic.
 * @tags noop, sink, placeholder, discard, drop, branch, dead-end, style:node
 * @uses @codemation/core-nodes, node:NoOp, node:If
 * @dependencies @codemation/core-nodes@workspace:*
 */

import { createWorkflowBuilder, WebhookTrigger, If, NoOp, MapData } from "@codemation/core-nodes";

type EventPayload = Readonly<{
  eventType: string;
  data: Record<string, unknown>;
}>;

type ProcessedEvent = EventPayload & Readonly<{ processedAt: string }>;

export default createWorkflowBuilder({
  id: "example.node-noop",
  name: "NoOp: discard uninteresting events explicitly",
})
  .trigger(
    new WebhookTrigger("Mixed event stream", {
      endpointKey: "mixed-events",
      methods: ["POST"],
    }),
  )
  // Branch: process only "order.created" events; discard everything else.
  .then(new If<EventPayload>("Is an order event?", (item) => item.json.eventType === "order.created"))
  .when({
    // Real work: stamp the order event and forward it.
    true: [
      new MapData<EventPayload, ProcessedEvent>("Process order event", (item) => ({
        ...item.json,
        processedAt: new Date().toISOString(),
      })),
    ],
    // NoOp makes the discard explicit and visible in the canvas.
    // Use NoOp instead of leaving a branch dangling — it documents intent and satisfies port wiring.
    false: [new NoOp("Discard non-order events")],
  })
  .build();
