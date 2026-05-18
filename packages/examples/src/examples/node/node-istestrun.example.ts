/**
 * @description Webhook trigger → IsTestRun branches on live-vs-test → sends real email only on live; NoOp in test.
 * Demonstrates IsTestRun as the guard node for side-effecting steps: true port = test run, false port = live run.
 * @tags testing, guard, branch, test, conditional, bypass, notification, side-effect, style:node
 * @uses @codemation/core-nodes, node:IsTestRun, node:WebhookTrigger
 * @dependencies @codemation/core-nodes@workspace:*
 */

import { createWorkflowBuilder, IsTestRun, NoOp, HttpRequest, WebhookTrigger } from "@codemation/core-nodes";

type OrderEvent = Readonly<{
  orderId: string;
  customerEmail: string;
  total: number;
}>;

export default createWorkflowBuilder({
  id: "example.node-istestrun",
  name: "IsTestRun: skip live notifications during test runs",
})
  .trigger(
    new WebhookTrigger("Order placed", {
      endpointKey: "order-placed",
      methods: ["POST"],
    }),
  )
  // IsTestRun routes to "true" when the execution carries a TestContext (triggered by a TestTrigger
  // or the Tests tab) and to "false" for all live/manual/cron/webhook activations.
  // Use it to guard against sending real emails, charging cards, or writing to production DBs during tests.
  .then(new IsTestRun<OrderEvent>("Is this a test run?"))
  .when({
    // In test mode: skip the notification (use NoOp as a no-cost sink).
    true: [new NoOp("Skip notification (test run)")],
    // In live mode: send the real notification to the customer.
    false: [
      new HttpRequest("Send order confirmation", {
        method: "POST",
        url: "https://api.example.com/notify/order-confirmation",
        body: {
          kind: "json",
          data: JSON.stringify({ event: "order.confirmed" }),
        },
      }),
    ],
  })
  .build();
