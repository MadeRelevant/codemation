import { branchRef, credentialId, credentialRef } from "@codemation/core";
import { ClassifyMailToolConfig } from "../tools/classifyMailTool";
import { AIAgent, Callback, createWorkflowBuilder, If, ManualTrigger, MapData, OpenAIChatModelConfig, SubWorkflow } from "@codemation/core-nodes";
import { ExampleUppercase } from "@codemation/node-example";

export const ORDERS_CREATE_START = "orders.create.start";

export default createWorkflowBuilder({ id: "wf.example", name: "Example workflow" })
.trigger(new ManualTrigger("Manual trigger"))
.then(new MapData("Seed", () => ({ subject: "RFQ: 1000 widgets", from: "buyer@acme.com", body: "please quote 1000 widgets" })))
.then(new ExampleUppercase("Uppercase subject", { field: "subject" }))
.then(
  new AIAgent(
    "Classify (agent)",
    "Classify if the message is an RFQ. Use the available tools when needed and return a concise result.",
    (item) => JSON.stringify(item.json ?? {}),
    new OpenAIChatModelConfig("OpenAI", "gpt-4.1", credentialRef(credentialId<string>("openai.apiKey")), { icon: "bot", label: "OpenAI" }),
    [new ClassifyMailToolConfig("classifyMail", ["RFQ", "QUOTE", "QUOTATION"], undefined, { icon: "mail", label: "Classify mail" })],
  ),
)
.then(new If("If RFQ?", (item) => Boolean((item.json as { classification?: { isRfq?: boolean } })?.classification?.isRfq)))
.when({
  true: [new Callback("Create order (callback)", () => {
    return [{ json: { order: "created" } }];
  })],
  false: [
    new MapData("Not RFQ", (item) => {
      const base = typeof item.json === "object" && item.json !== null ? (item.json as Record<string, unknown>) : {};
      return { ...base, note: "Not an RFQ" };
    }),
  ],
})
.build()