import { WorkflowBuilder, branchRef } from "@codemation/core";
import { AIAgent, If, ManualTrigger, MapData, SubWorkflow } from "@codemation/core-nodes";
import { ExampleUppercase } from "@codemation/node-example";

export const ORDERS_CREATE_START = "orders.create.start";

export const workflows = [
  new WorkflowBuilder({ id: "orders.create", name: "Create order" })
    .start(new MapData("Create order", (item) => ({ ok: true, orderId: "o_123", input: item.json }), ORDERS_CREATE_START))
    .build(),

  new WorkflowBuilder({ id: "wf.example", name: "Example workflow" })
    .trigger(new ManualTrigger("Manual trigger"))
    .then(new MapData("Seed", () => ({ subject: "RFQ: 1000 widgets", from: "buyer@acme.com", body: "please quote 1000 widgets" })))
    .then(new ExampleUppercase("Uppercase subject", { field: "subject" }))
    .then(
      new AIAgent("Classify (agent)", {
        systemMessage: "Classify if subject is RFQ.",
        userMessageFormatter: (item) => JSON.stringify(item.json ?? {}),
        chatModel: { provider: "openai", model: "gpt-4.1", options: {} },
        tools: [{ name: "classifyMail", token: "classifyMailTool" }],
      }),
    )
    .then(new If("If RFQ?", (item) => String((item.json as any)?.subject ?? "").toUpperCase().includes("RFQ")))
    .when(true, [
      new SubWorkflow("Create order (subworkflow)", "orders.create", [branchRef(0)], ORDERS_CREATE_START),
    ])
    .when(false, [
      new MapData("Not RFQ", (item) => {
        const base = typeof item.json === "object" && item.json !== null ? (item.json as Record<string, unknown>) : {};
        return { ...base, note: "Not an RFQ" };
      }),
    ])
    .build(),
];

