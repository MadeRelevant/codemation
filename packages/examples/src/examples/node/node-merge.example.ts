/**
 * @description If branches (high/low priority) recombined by Merge into a single stream for downstream processing.
 * Demonstrates Merge as the fan-in complement to If/Switch: append mode concatenates both branches.
 * @tags merge, fan-in, branching, combine, rejoin, concat, collect, style:node
 * @uses @codemation/core-nodes, node:Merge, node:If, node:MapData
 * @dependencies @codemation/core-nodes@workspace:*
 */

import { createWorkflowBuilder, WebhookTrigger, If, MapData, Merge } from "@codemation/core-nodes";

type SupportTicket = Readonly<{
  id: string;
  subject: string;
  priority: "high" | "low";
}>;

type LabeledTicket = SupportTicket & Readonly<{ lane: string; slaSecs: number }>;

export default createWorkflowBuilder({
  id: "example.node-merge",
  name: "Merge: recombine priority branches",
})
  .trigger(
    new WebhookTrigger("Support ticket", {
      endpointKey: "support-ticket",
      methods: ["POST"],
    }),
  )
  // Branch on priority — high-priority tickets get a tighter SLA label.
  .then(new If<SupportTicket>("High priority?", (item) => item.json.priority === "high"))
  .when({
    true: [
      new MapData<SupportTicket, LabeledTicket>("Label high-priority", (item) => ({
        ...item.json,
        lane: "urgent",
        slaSecs: 3600,
      })),
    ],
    false: [
      new MapData<SupportTicket, LabeledTicket>("Label low-priority", (item) => ({
        ...item.json,
        lane: "standard",
        slaSecs: 86400,
      })),
    ],
  })
  // Merge recombines both branches into a single stream so downstream nodes see all tickets.
  // mode "append" concatenates items from all inputs in declaration order.
  // mode "passThrough" emits only the first input that arrives (useful for fallbacks).
  .then(new Merge<LabeledTicket>("Rejoin lanes", { mode: "append" }))
  .build();
