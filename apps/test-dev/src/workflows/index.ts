import { ChatModelConfigFactory, branchRef, credentialRef, credentialId } from "@codemation/core";
import { AIAgent, If, ManualTrigger, MapData, SubWorkflow, createWorkflowBuilder } from "@codemation/core-nodes";
import { ExampleUppercase } from "@codemation/node-example";
import { ClassifyMailTool } from "../tools/classifyMailTool";

export const ORDERS_CREATE_START = "orders.create.start";

export const workflows = [
  createWorkflowBuilder({ id: "wf.consumer.demo", name: "Consumer demo (no OpenAI)" })
    .trigger(new ManualTrigger("Manual trigger"))
    .then(new MapData("Seed", () => ({ subject: "RFQ: 1000 widgets", from: "buyer@acme.com" })))
    .then(new If("If RFQ?", (item) => String((item.json as any)?.subject ?? "").toUpperCase().includes("RFQ")))
    .when({
      true: [new SubWorkflow("Create order (subworkflow)", "orders.create", [branchRef(0)], ORDERS_CREATE_START)],
      false: [new MapData("Not RFQ", () => ({ note: "Not an RFQ" }))],
    })
    .build(),

  createWorkflowBuilder({ id: "orders.create", name: "Create order" })
    .start(new MapData("Create order", (item) => ({ ok: true, orderId: "o_123", input: item.json }), ORDERS_CREATE_START))
    .build(),

  createWorkflowBuilder({ id: "wf.e2e.offload", name: "E2E offload (deterministic)" })
    .trigger(new ManualTrigger("Manual trigger"))
    .then(new ExampleUppercase("Uppercase subject", { field: "subject" }, "e2e.uppercase"))
    .build(),

  createWorkflowBuilder({ id: "wf.example", name: "Example workflow" })
    .trigger(new ManualTrigger("Manual trigger"))
    .then(new MapData("Seed", () => ({ subject: "RFQ: 1000 widgets", from: "buyer@acme.com", body: "please quote 1000 widgets" })))
    .then(new ExampleUppercase("Uppercase subject", { field: "subject" }))
    .then(
      new AIAgent("Classify (agent)", {
        systemMessage: "Classify if subject is RFQ.",
        userMessageFormatter: (item) => JSON.stringify(item.json ?? {}),
        chatModel: ChatModelConfigFactory.openai("gpt-4.1", {
          apiKey: credentialRef(credentialId<string>("openai.apiKey")),
          options: {},
        }),
        tools: [ClassifyMailTool],
      }),
    )
    .then(new If("If RFQ?", (item) => String((item.json as any)?.subject ?? "").toUpperCase().includes("RFQ")))
    .when({
      true: [new SubWorkflow("Create order (subworkflow)", "orders.create", [branchRef(0)], ORDERS_CREATE_START)],
      false: [
        new MapData("Not RFQ", (item) => {
          const base = typeof item.json === "object" && item.json !== null ? (item.json as Record<string, unknown>) : {};
          return { ...base, note: "Not an RFQ" };
        }),
      ],
    })
    .build(),
];

